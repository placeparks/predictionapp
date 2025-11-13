-- Migration script to change session_id from date to text for TEST_MODE support
-- Run this if you're getting "invalid input syntax for type date" errors

-- Step 1: Drop the view that depends on session_id columns
DROP VIEW IF EXISTS v_base_daily_winners;

-- Step 2: Alter base_daily_entries table
ALTER TABLE base_daily_entries 
  ALTER COLUMN session_id TYPE text USING session_id::text;

-- Step 3: Alter base_daily_outcomes table  
ALTER TABLE base_daily_outcomes
  ALTER COLUMN session_id TYPE text USING session_id::text;

-- Step 4: Alter base_daily_sessions table
ALTER TABLE base_daily_sessions
  ALTER COLUMN session_id TYPE text USING session_id::text;

-- Step 5: Alter base_daily_metrics_cache table
ALTER TABLE base_daily_metrics_cache
  ALTER COLUMN session_id TYPE text USING session_id::text;

-- Step 6: Alter base_daily_settlements table
ALTER TABLE base_daily_settlements
  ALTER COLUMN session_id TYPE text USING session_id::text;

-- Step 7: Drop the old function if it exists (with date parameter)
DROP FUNCTION IF EXISTS award_base_daily_market(date, text);
DROP FUNCTION IF EXISTS award_base_daily_market(text, text);

-- Step 8: Recreate the function with text parameter
CREATE OR REPLACE FUNCTION award_base_daily_market(p_session text, p_market text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  already_awarded boolean;
  awarded integer := 0;
  winner record;
  lock_key bigint;
BEGIN
  lock_key := hashtextextended('base_daily_award', 0) # (hashtext(p_session) # hashtext(p_market));
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT EXISTS(
    SELECT 1
    FROM base_daily_settlements
    WHERE session_id = p_session
      AND market_id = p_market
  )
  INTO already_awarded;

  IF already_awarded THEN
    RETURN jsonb_build_object('ok', true, 'already_awarded', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM base_daily_outcomes
    WHERE session_id = p_session
      AND market_id = p_market
      AND outcome_yes IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'outcome_missing');
  END IF;

  FOR winner IN
    SELECT user_address, win_points
    FROM v_base_daily_winners
    WHERE session_id = p_session
      AND market_id = p_market
  LOOP
    PERFORM grant_points(winner.user_address, winner.win_points);
    awarded := awarded + 1;
  END LOOP;

  INSERT INTO base_daily_settlements(session_id, market_id, awarded_count)
  VALUES (p_session, p_market, awarded);

  UPDATE base_daily_outcomes
     SET awarded = true,
         awarded_at = now()
   WHERE session_id = p_session
     AND market_id = p_market;

  RETURN jsonb_build_object('ok', true, 'awarded_count', awarded);
END;
$$;

-- Step 9: Recreate the view
CREATE OR REPLACE VIEW v_base_daily_winners AS
SELECT
  e.session_id,
  e.market_id,
  e.user_address,
  sum(1)::int AS win_points
FROM base_daily_entries e
JOIN base_daily_outcomes o
  ON o.session_id = e.session_id
 AND o.market_id = e.market_id
WHERE (o.outcome_yes IS true  AND e.side_yes IS true)
   OR (o.outcome_yes IS false AND e.side_yes IS false)
GROUP BY e.session_id, e.market_id, e.user_address;

-- Note: The USING clause converts existing date values to text format (YYYY-MM-DD)
-- This should work for existing data, but new TEST_MODE sessions will use YYYY-MM-DD-HH:MM format

