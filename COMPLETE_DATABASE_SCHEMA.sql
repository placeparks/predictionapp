-- ============================================================================
-- COMPLETE DATABASE SCHEMA FOR KALSHI MINIAPP
-- ============================================================================
-- This file contains all SQL statements needed to set up the database
-- Run these in order in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 2. WALLET STATS & ELIGIBILITY (Tier System)
-- ============================================================================
-- From: 001.sql

CREATE TABLE IF NOT EXISTS wallet_stats (
  address TEXT PRIMARY KEY,
  chain TEXT NOT NULL DEFAULT 'base',
  tx_count INT NOT NULL DEFAULT 0,
  unique_peers INT NOT NULL DEFAULT 0,
  erc20_count INT NOT NULL DEFAULT 0,
  erc20_usd NUMERIC NOT NULL DEFAULT 0,
  nft_collections INT NOT NULL DEFAULT 0,
  nft_count INT NOT NULL DEFAULT 0,
  has_basename BOOLEAN NOT NULL DEFAULT FALSE,
  last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eligibility (
  address TEXT PRIMARY KEY,
  tier INT NOT NULL DEFAULT 0,
  next_tier INT NOT NULL DEFAULT 1,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Minted NFT tracking (from supabase_migration.sql)
  minted_tier INTEGER,
  minted_animal TEXT,
  minted_token_id INTEGER,
  minted_metadata_url TEXT,
  minted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wallet_stats_last_idx ON wallet_stats (last_indexed_at DESC);

-- Normalize eligibility addresses to lowercase (for consistency)
CREATE OR REPLACE FUNCTION normalize_eligibility_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.address := LOWER(NEW.address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eligibility_normalize ON eligibility;
CREATE TRIGGER trg_eligibility_normalize 
  BEFORE INSERT OR UPDATE ON eligibility
  FOR EACH ROW EXECUTE FUNCTION normalize_eligibility_address();

-- Comments for eligibility table
COMMENT ON COLUMN eligibility.tier IS 'Current eligible tier';
COMMENT ON COLUMN eligibility.minted_tier IS 'Tier that was actually minted as NFT (snapshot at mint time)';
COMMENT ON COLUMN eligibility.minted_animal IS 'Animal name for the minted tier';
COMMENT ON COLUMN eligibility.minted_token_id IS 'Token ID of the minted NFT';
COMMENT ON COLUMN eligibility.minted_metadata_url IS 'IPFS/Pinata URL of the minted NFT metadata';
COMMENT ON COLUMN eligibility.minted_at IS 'Timestamp when the NFT was minted';

-- ============================================================================
-- 3. BET TOKENS SYSTEM (Rewards)
-- ============================================================================
-- From: supabase_points.sql
-- Note: Table name kept as 'points_balances' for backward compatibility
-- The 'points' column stores BET tokens (rewards)

CREATE TABLE IF NOT EXISTS points_balances (
  user_address TEXT PRIMARY KEY,
  points NUMERIC NOT NULL DEFAULT 0, -- Stores BET tokens
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure lowercased addresses
CREATE OR REPLACE FUNCTION normalize_points_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_address := LOWER(NEW.user_address);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_points_normalize ON points_balances;
CREATE TRIGGER trg_points_normalize 
  BEFORE INSERT OR UPDATE ON points_balances
  FOR EACH ROW EXECUTE FUNCTION normalize_points_address();

-- Atomically add BET tokens (purchase or admin grant)
CREATE OR REPLACE FUNCTION grant_points(p_user TEXT, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  INSERT INTO points_balances(user_address, points)
  VALUES (LOWER(p_user), GREATEST(p_amount, 0))
  ON CONFLICT (user_address) 
  DO UPDATE SET 
    points = points_balances.points + GREATEST(p_amount, 0), 
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Atomically spend BET tokens, returns true if success
CREATE OR REPLACE FUNCTION spend_points(p_user TEXT, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE 
  ok INTEGER;
BEGIN
  UPDATE points_balances
  SET points = points - p_amount, updated_at = NOW()
  WHERE user_address = LOWER(p_user) AND points >= p_amount;
  GET DIAGNOSTICS ok = ROW_COUNT;
  RETURN ok > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. PREDICTIONS SYSTEM (Kalshi Markets)
-- ============================================================================
-- From: supabase_predictions.sql

-- Markets metadata mirrored from Kalshi (optional, for frontend caching)
CREATE TABLE IF NOT EXISTS markets (
  market_id TEXT PRIMARY KEY,         -- keccak256(ticker) or ticker itself
  ticker TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  category TEXT,
  status TEXT,
  close_ts BIGINT,
  open_interest NUMERIC,
  volume NUMERIC,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);

-- Periods for vault accounting (Flow 2)
CREATE TABLE IF NOT EXISTS periods (
  period_id BIGINT PRIMARY KEY,
  vault_id BIGINT NOT NULL,
  status TEXT DEFAULT 'open',     -- open | settled | closed
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User predictions (EIP-712 signed off-chain records)
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  vault_id BIGINT NOT NULL,
  period_id BIGINT NOT NULL REFERENCES periods(period_id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  side_yes BOOLEAN NOT NULL,
  stake_points NUMERIC NOT NULL,
  nonce NUMERIC NOT NULL,
  deadline BIGINT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Settlement tracking (from supabase_predictions_migration.sql)
  settled BOOLEAN DEFAULT FALSE,
  settled_at TIMESTAMPTZ,
  won BOOLEAN,
  -- Market metadata (from supabase_predictions_add_title.sql)
  market_title TEXT,
  market_ticker TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_predictions_user_nonce 
  ON predictions(user_address, nonce);
CREATE INDEX IF NOT EXISTS idx_predictions_market_period 
  ON predictions(market_id, period_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user 
  ON predictions(user_address);
CREATE INDEX IF NOT EXISTS idx_predictions_settled 
  ON predictions(settled, market_id);
CREATE INDEX IF NOT EXISTS idx_predictions_period_settled 
  ON predictions(period_id, settled);
CREATE INDEX IF NOT EXISTS idx_predictions_market_ticker 
  ON predictions(market_ticker);

-- Comments for predictions table
COMMENT ON COLUMN predictions.settled IS 'Whether this prediction has been settled (can be settled even after period closes)';
COMMENT ON COLUMN predictions.settled_at IS 'Timestamp when prediction was settled';
COMMENT ON COLUMN predictions.won IS 'Whether the prediction won (true) or lost (false)';
COMMENT ON COLUMN predictions.market_title IS 'Human-readable title of the prediction market';
COMMENT ON COLUMN predictions.market_ticker IS 'Kalshi market ticker (e.g., YES-2024-ELECTION)';

-- Outcomes resolved from Kalshi API via oracle worker
CREATE TABLE IF NOT EXISTS outcomes (
  market_id TEXT PRIMARY KEY,
  resolved BOOLEAN DEFAULT FALSE,
  side_yes BOOLEAN,
  settlement_ts TIMESTAMPTZ,
  source TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Distribution records once settlement is applied
CREATE TABLE IF NOT EXISTS distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id BIGINT NOT NULL REFERENCES periods(period_id) ON DELETE CASCADE,
  user_address TEXT NOT NULL,
  amount_usdc NUMERIC NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_distributions_user ON distributions(user_address);
CREATE INDEX IF NOT EXISTS idx_distributions_period ON distributions(period_id);

-- ============================================================================
-- 5. BASE DAILY PREDICTIONS SYSTEM
-- ============================================================================
-- From: supabase_base_daily.sql

CREATE TABLE IF NOT EXISTS base_daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL, -- Supports YYYY-MM-DD or YYYY-MM-DD-HH-MM format (test mode)
  market_id TEXT NOT NULL,
  user_address TEXT NOT NULL,
  side_yes BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_base_daily_entries_unique
  ON base_daily_entries(session_id, market_id, user_address);

CREATE INDEX IF NOT EXISTS idx_base_daily_entries_market
  ON base_daily_entries(session_id, market_id, side_yes);

CREATE INDEX IF NOT EXISTS idx_base_daily_entries_session
  ON base_daily_entries(session_id, market_id, user_address);

-- Normalize user addresses to lowercase
CREATE OR REPLACE FUNCTION normalize_base_daily_entry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_address := LOWER(NEW.user_address);
  NEW.created_at := COALESCE(NEW.created_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_base_daily_entries_normalize ON base_daily_entries;
CREATE TRIGGER trg_base_daily_entries_normalize
  BEFORE INSERT OR UPDATE ON base_daily_entries
  FOR EACH ROW EXECUTE FUNCTION normalize_base_daily_entry();

-- Outcomes for base daily markets
CREATE TABLE IF NOT EXISTS base_daily_outcomes (
  session_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  outcome_yes BOOLEAN NOT NULL,
  resolved_at TIMESTAMPTZ DEFAULT NOW(),
  awarded BOOLEAN NOT NULL DEFAULT FALSE,
  awarded_at TIMESTAMPTZ,
  PRIMARY KEY (session_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_base_daily_outcomes_session
  ON base_daily_outcomes(session_id, market_id, awarded);

CREATE OR REPLACE FUNCTION touch_base_daily_outcome()
RETURNS TRIGGER AS $$
BEGIN
  NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_base_daily_outcomes_touch ON base_daily_outcomes;
CREATE TRIGGER trg_base_daily_outcomes_touch
  BEFORE INSERT OR UPDATE ON base_daily_outcomes
  FOR EACH ROW EXECUTE FUNCTION touch_base_daily_outcome();

-- Session tracker
CREATE TABLE IF NOT EXISTS base_daily_sessions (
  session_id TEXT PRIMARY KEY,
  phase TEXT NOT NULL CHECK (phase IN ('open','locked','settled','break')),
  open_at TIMESTAMPTZ NOT NULL,
  lock_at TIMESTAMPTZ NOT NULL,
  resolve_at TIMESTAMPTZ NOT NULL,
  anchor_time TIMESTAMPTZ,
  anchor_block BIGINT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION touch_base_daily_session()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_base_daily_sessions_touch ON base_daily_sessions;
CREATE TRIGGER trg_base_daily_sessions_touch
  BEFORE INSERT OR UPDATE ON base_daily_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_base_daily_session();

-- Metrics cache for audit and automation
CREATE TABLE IF NOT EXISTS base_daily_metrics_cache (
  session_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('baseline','pre','final')),
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, market_id, phase, source)
);

CREATE INDEX IF NOT EXISTS idx_base_daily_metrics_session
  ON base_daily_metrics_cache(session_id, market_id, phase);

-- Settlement log
CREATE TABLE IF NOT EXISTS base_daily_settlements (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  awarded_count INTEGER NOT NULL DEFAULT 0,
  merkle_root BYTEA,
  ipfs_cid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_base_daily_settlements_session
  ON base_daily_settlements(session_id);

-- View for winners calculation
CREATE OR REPLACE VIEW v_base_daily_winners AS
SELECT
  e.session_id,
  e.market_id,
  e.user_address,
  SUM(1)::INT AS win_points
FROM base_daily_entries e
JOIN base_daily_outcomes o
  ON o.session_id = e.session_id
 AND o.market_id = e.market_id
WHERE (o.outcome_yes IS TRUE  AND e.side_yes IS TRUE)
   OR (o.outcome_yes IS FALSE AND e.side_yes IS FALSE)
GROUP BY e.session_id, e.market_id, e.user_address;

-- Function to award points to winners
CREATE OR REPLACE FUNCTION award_base_daily_market(p_session TEXT, p_market TEXT)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  already_awarded BOOLEAN;
  awarded INTEGER := 0;
  winner RECORD;
  lock_key BIGINT;
  v_multiplier NUMERIC := 1;
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
    RETURN jsonb_build_object('ok', TRUE, 'already_awarded', TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM base_daily_outcomes
    WHERE session_id = p_session
      AND market_id = p_market
      AND outcome_yes IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'outcome_missing');
  END IF;

  FOR winner IN
    SELECT user_address, win_points
    FROM v_base_daily_winners
    WHERE session_id = p_session
      AND market_id = p_market
  LOOP
    -- Apply Genesis Ring multiplier (3x for Genesis Ring users, 1x for others)
    -- Note: This requires the referral system to be set up (supabase_referrals.sql)
    v_multiplier := 1; -- Reset to default
    
    -- Try to get multiplier (will be 1 if referral system not set up or user not Genesis Ring)
    BEGIN
      SELECT COALESCE(get_bet_token_multiplier(winner.user_address), 1) INTO v_multiplier;
    EXCEPTION WHEN OTHERS THEN
      v_multiplier := 1; -- Default to 1x if function doesn't exist yet
    END;
    
    PERFORM grant_points(winner.user_address, winner.win_points * v_multiplier);
    awarded := awarded + 1;
  END LOOP;

  INSERT INTO base_daily_settlements(session_id, market_id, awarded_count)
  VALUES (p_session, p_market, awarded);

  UPDATE base_daily_outcomes
     SET awarded = TRUE,
         awarded_at = NOW()
   WHERE session_id = p_session
     AND market_id = p_market;

  RETURN jsonb_build_object('ok', TRUE, 'awarded_count', awarded);
END;
$$;

-- ============================================================================
-- 6. REFERRAL SYSTEM
-- ============================================================================
-- IMPORTANT: After running this schema, you MUST also run supabase_referrals.sql
-- The referral system handles:
-- - Referral rewards (100 BET tokens to referrer, 50 to new user)
-- - Genesis Ring (triple BET week for Genesis users with 5+ active referrals)
-- See: supabase_referrals.sql for the complete referral system setup

-- ============================================================================
-- 7. ENERGY SYSTEM
-- ============================================================================
-- IMPORTANT: After running this schema, you MUST also run supabase_energy.sql
-- The energy system is separate and handles prediction costs (30 energy per prediction)
-- See: supabase_energy.sql for the complete energy system setup

-- ============================================================================
-- 8. INITIAL DATA SETUP
-- ============================================================================
-- From: create_period.sql

-- Create a default period for testing predictions
-- Replace VAULT_ID with your actual vault_id (default is 1)
INSERT INTO periods (period_id, vault_id, status, starts_at, ends_at)
VALUES (
  1,  -- period_id (matches NEXT_PUBLIC_CURRENT_PERIOD_ID)
  1,  -- vault_id (matches NEXT_PUBLIC_FORECAST_VAULT_ID)
  'open',  -- status
  NOW(),  -- starts_at
  NOW() + INTERVAL '30 days'  -- ends_at (adjust as needed)
)
ON CONFLICT (period_id) DO NOTHING;

-- ============================================================================
-- USEFUL QUERIES FOR DEVELOPMENT
-- ============================================================================

-- Check all tables
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' ORDER BY table_name;

-- View all predictions with market info
-- SELECT p.*, m.title, m.ticker 
-- FROM predictions p 
-- LEFT JOIN markets m ON p.market_id = m.market_id 
-- ORDER BY p.created_at DESC;

-- View user BET tokens (rewards)
-- SELECT * FROM points_balances ORDER BY points DESC;

-- View user energy (requires energy system from supabase_energy.sql)
-- SELECT * FROM energy_balances ORDER BY energy DESC;

-- View base daily session status
-- SELECT * FROM base_daily_sessions ORDER BY updated_at DESC LIMIT 5;

-- View unsettled predictions
-- SELECT * FROM predictions WHERE settled = FALSE ORDER BY created_at DESC;

-- View outcomes
-- SELECT * FROM outcomes WHERE resolved = TRUE ORDER BY settlement_ts DESC;

-- ============================================================================
-- IMPORTANT: NEXT STEPS
-- ============================================================================
-- After running this schema, you MUST also run (in order):
-- 1. supabase_referrals.sql - For the referral system and Genesis Ring
-- 2. supabase_energy.sql - For the energy system (30 energy per prediction)
--
-- Both systems are required for the full application functionality.
-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

