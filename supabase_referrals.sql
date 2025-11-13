-- ============================================================================
-- REFERRAL SYSTEM WITH GENESIS RING
-- ============================================================================
-- Referral rewards: 100 BET tokens to referrer, 50 BET tokens to new user
-- Genesis Ring: Genesis users with 5+ active referral streaks unlock triple BET week
-- ============================================================================

-- Referrals table - tracks referral relationships
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_address TEXT NOT NULL, -- The user who referred
  referred_address TEXT NOT NULL, -- The new user who was referred
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Reward tracking
  referrer_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  referred_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  referrer_rewarded_at TIMESTAMPTZ,
  referred_rewarded_at TIMESTAMPTZ,
  -- Activity tracking for Genesis Ring
  first_bet_at TIMESTAMPTZ, -- When the referred user made their first bet
  active_at TIMESTAMPTZ, -- When referral became active (betting > 3 days)
  is_active BOOLEAN NOT NULL DEFAULT FALSE, -- Whether referral is active (betting > 3 days)
  -- Constraints
  UNIQUE(referred_address), -- Each user can only be referred once
  CHECK(referrer_address != referred_address) -- Can't refer yourself
);

-- Normalize addresses to lowercase
CREATE OR REPLACE FUNCTION normalize_referral_addresses()
RETURNS TRIGGER AS $$
BEGIN
  NEW.referrer_address := LOWER(NEW.referrer_address);
  NEW.referred_address := LOWER(NEW.referred_address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referrals_normalize ON referrals;
CREATE TRIGGER trg_referrals_normalize 
  BEFORE INSERT OR UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION normalize_referral_addresses();

-- Indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_address);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_address);
CREATE INDEX IF NOT EXISTS idx_referrals_active ON referrals(referrer_address, is_active);
CREATE INDEX IF NOT EXISTS idx_referrals_first_bet ON referrals(referred_address, first_bet_at);

-- Genesis users table - tracks Genesis status and Genesis Ring eligibility
CREATE TABLE IF NOT EXISTS genesis_users (
  address TEXT PRIMARY KEY,
  is_genesis BOOLEAN NOT NULL DEFAULT FALSE, -- Whether user is a Genesis user
  genesis_ring_unlocked BOOLEAN NOT NULL DEFAULT FALSE, -- Whether Genesis Ring (triple BET week) is unlocked
  genesis_ring_unlocked_at TIMESTAMPTZ, -- When Genesis Ring was unlocked
  active_referral_streak INT NOT NULL DEFAULT 0, -- Current count of active referrals (betting > 3 days)
  last_streak_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Normalize genesis user addresses
CREATE OR REPLACE FUNCTION normalize_genesis_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.address := LOWER(NEW.address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_genesis_normalize ON genesis_users;
CREATE TRIGGER trg_genesis_normalize 
  BEFORE INSERT OR UPDATE ON genesis_users
  FOR EACH ROW EXECUTE FUNCTION normalize_genesis_address();

CREATE INDEX IF NOT EXISTS idx_genesis_ring ON genesis_users(is_genesis, genesis_ring_unlocked);

-- Function to check if a referral is active (referred user has been betting > 3 days)
-- This should be called periodically or when a referred user makes a bet
CREATE OR REPLACE FUNCTION check_referral_activity(p_referred_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_first_bet TIMESTAMPTZ;
  v_referral_id UUID;
  v_is_active BOOLEAN;
  v_referrer_address TEXT;
BEGIN
  -- Get the referral record
  SELECT id, referrer_address, first_bet_at, is_active
  INTO v_referral_id, v_referrer_address, v_first_bet, v_is_active
  FROM referrals
  WHERE referred_address = LOWER(p_referred_address);
  
  -- If no referral found, return false
  IF v_referral_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- If already active, return true
  IF v_is_active THEN
    RETURN TRUE;
  END IF;
  
  -- If no first bet yet, check if user has made any predictions
  IF v_first_bet IS NULL THEN
    -- Check if user has made any predictions (Kalshi or Base Daily)
    SELECT MIN(created_at)
    INTO v_first_bet
    FROM (
      SELECT created_at FROM predictions WHERE user_address = LOWER(p_referred_address)
      UNION ALL
      SELECT created_at FROM base_daily_entries WHERE user_address = LOWER(p_referred_address)
    ) AS all_predictions;
    
    -- Update first_bet_at if found
    IF v_first_bet IS NOT NULL THEN
      UPDATE referrals
      SET first_bet_at = v_first_bet
      WHERE id = v_referral_id;
    ELSE
      RETURN FALSE; -- No bets yet
    END IF;
  END IF;
  
  -- Check if 3 days have passed since first bet
  IF v_first_bet IS NOT NULL AND NOW() >= (v_first_bet + INTERVAL '3 days') THEN
    -- Mark as active
    UPDATE referrals
    SET is_active = TRUE, active_at = NOW()
    WHERE id = v_referral_id;
    
    -- Update Genesis user's active referral streak if referrer is Genesis
    IF EXISTS (SELECT 1 FROM genesis_users WHERE address = v_referrer_address AND is_genesis = TRUE) THEN
      PERFORM update_genesis_referral_streak(v_referrer_address);
    END IF;
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to update Genesis user's active referral streak
CREATE OR REPLACE FUNCTION update_genesis_referral_streak(p_genesis_address TEXT)
RETURNS VOID AS $$
DECLARE
  v_active_count INT;
  v_should_unlock BOOLEAN;
BEGIN
  -- Count active referrals for this Genesis user
  SELECT COUNT(*)
  INTO v_active_count
  FROM referrals
  WHERE referrer_address = LOWER(p_genesis_address)
    AND is_active = TRUE;
  
  -- Update the streak count
  UPDATE genesis_users
  SET 
    active_referral_streak = v_active_count,
    last_streak_updated_at = NOW()
  WHERE address = LOWER(p_genesis_address);
  
  -- Check if Genesis Ring should be unlocked (5+ active referrals)
  IF v_active_count >= 5 AND NOT EXISTS (
    SELECT 1 FROM genesis_users 
    WHERE address = LOWER(p_genesis_address) 
    AND genesis_ring_unlocked = TRUE
  ) THEN
    -- Unlock Genesis Ring (triple BET week)
    UPDATE genesis_users
    SET 
      genesis_ring_unlocked = TRUE,
      genesis_ring_unlocked_at = NOW()
    WHERE address = LOWER(p_genesis_address);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to process referral rewards (100 to referrer, 50 to new user)
CREATE OR REPLACE FUNCTION process_referral_rewards(p_referred_address TEXT)
RETURNS JSONB AS $$
DECLARE
  v_referral RECORD;
  v_referrer_rewarded BOOLEAN := FALSE;
  v_referred_rewarded BOOLEAN := FALSE;
BEGIN
  -- Get referral record
  SELECT *
  INTO v_referral
  FROM referrals
  WHERE referred_address = LOWER(p_referred_address);
  
  IF v_referral IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'referral_not_found');
  END IF;
  
  -- Reward referrer (100 BET tokens) if not already rewarded
  IF NOT v_referral.referrer_rewarded THEN
    PERFORM grant_points(v_referral.referrer_address, 100);
    UPDATE referrals
    SET 
      referrer_rewarded = TRUE,
      referrer_rewarded_at = NOW()
    WHERE id = v_referral.id;
    v_referrer_rewarded := TRUE;
  END IF;
  
  -- Reward referred user (50 BET tokens) if not already rewarded
  IF NOT v_referral.referred_rewarded THEN
    PERFORM grant_points(v_referral.referred_address, 50);
    UPDATE referrals
    SET 
      referred_rewarded = TRUE,
      referred_rewarded_at = NOW()
    WHERE id = v_referral.id;
    v_referred_rewarded := TRUE;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', TRUE,
    'referrer_rewarded', v_referrer_rewarded,
    'referred_rewarded', v_referred_rewarded
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create a referral relationship
CREATE OR REPLACE FUNCTION create_referral(p_referrer_address TEXT, p_referred_address TEXT)
RETURNS JSONB AS $$
DECLARE
  v_referral_id UUID;
BEGIN
  -- Validate addresses
  IF LOWER(p_referrer_address) = LOWER(p_referred_address) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'cannot_refer_self');
  END IF;
  
  -- Check if referred user already has a referrer
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_address = LOWER(p_referred_address)) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_referred');
  END IF;
  
  -- Create referral
  INSERT INTO referrals (referrer_address, referred_address)
  VALUES (LOWER(p_referrer_address), LOWER(p_referred_address))
  RETURNING id INTO v_referral_id;
  
  -- Check if referrer is Genesis and update their record
  IF NOT EXISTS (SELECT 1 FROM genesis_users WHERE address = LOWER(p_referrer_address)) THEN
    INSERT INTO genesis_users (address, is_genesis)
    VALUES (LOWER(p_referrer_address), FALSE)
    ON CONFLICT (address) DO NOTHING;
  END IF;
  
  RETURN jsonb_build_object('ok', TRUE, 'referral_id', v_referral_id);
END;
$$ LANGUAGE plpgsql;

-- Function to mark a user as Genesis
CREATE OR REPLACE FUNCTION set_genesis_user(p_address TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO genesis_users (address, is_genesis)
  VALUES (LOWER(p_address), TRUE)
  ON CONFLICT (address) 
  DO UPDATE SET is_genesis = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically check referral activity when a user makes a prediction
-- This runs after a prediction is inserted
CREATE OR REPLACE FUNCTION trigger_check_referral_on_prediction()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this user is a referred user and update their referral activity
  PERFORM check_referral_activity(NEW.user_address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_predictions_check_referral ON predictions;
CREATE TRIGGER trg_predictions_check_referral
  AFTER INSERT ON predictions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_referral_on_prediction();

-- Trigger for Base Daily predictions
DROP TRIGGER IF EXISTS trg_base_daily_check_referral ON base_daily_entries;
CREATE TRIGGER trg_base_daily_check_referral
  AFTER INSERT ON base_daily_entries
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_referral_on_prediction();

-- Function to get BET token multiplier for a user (1x normal, 3x for Genesis Ring)
CREATE OR REPLACE FUNCTION get_bet_token_multiplier(p_address TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_multiplier NUMERIC := 1;
  v_genesis_ring BOOLEAN;
BEGIN
  -- Check if user has Genesis Ring unlocked
  SELECT genesis_ring_unlocked
  INTO v_genesis_ring
  FROM genesis_users
  WHERE address = LOWER(p_address);
  
  IF v_genesis_ring = TRUE THEN
    v_multiplier := 3; -- Triple BET week
  END IF;
  
  RETURN v_multiplier;
END;
$$ LANGUAGE plpgsql;

-- View to see Genesis Ring status
CREATE OR REPLACE VIEW v_genesis_ring_status AS
SELECT 
  g.address,
  g.is_genesis,
  g.genesis_ring_unlocked,
  g.genesis_ring_unlocked_at,
  g.active_referral_streak,
  COUNT(r.id) FILTER (WHERE r.is_active = TRUE) AS current_active_referrals,
  COUNT(r.id) AS total_referrals
FROM genesis_users g
LEFT JOIN referrals r ON r.referrer_address = g.address
WHERE g.is_genesis = TRUE
GROUP BY g.address, g.is_genesis, g.genesis_ring_unlocked, g.genesis_ring_unlocked_at, g.active_referral_streak;

-- View to see all referrals with activity status
CREATE OR REPLACE VIEW v_referrals_with_status AS
SELECT 
  r.id,
  r.referrer_address,
  r.referred_address,
  r.created_at,
  r.first_bet_at,
  r.active_at,
  r.is_active,
  r.referrer_rewarded,
  r.referred_rewarded,
  CASE 
    WHEN r.first_bet_at IS NULL THEN 'no_bets'
    WHEN r.is_active = TRUE THEN 'active'
    WHEN NOW() < (r.first_bet_at + INTERVAL '3 days') THEN 'pending'
    ELSE 'inactive'
  END AS status,
  g.is_genesis AS referrer_is_genesis
FROM referrals r
LEFT JOIN genesis_users g ON g.address = r.referrer_address;

-- Comments
COMMENT ON TABLE referrals IS 'Tracks referral relationships and rewards';
COMMENT ON COLUMN referrals.is_active IS 'True when referred user has been betting for more than 3 days';
COMMENT ON TABLE genesis_users IS 'Tracks Genesis users and Genesis Ring (triple BET week) status';
COMMENT ON COLUMN genesis_users.active_referral_streak IS 'Count of active referrals (betting > 3 days) for Genesis Ring eligibility';
COMMENT ON COLUMN genesis_users.genesis_ring_unlocked IS 'True when Genesis Ring (triple BET week) is unlocked (5+ active referrals)';
COMMENT ON FUNCTION get_bet_token_multiplier IS 'Returns 1 for normal users, 3 for Genesis Ring users (triple BET week)';

