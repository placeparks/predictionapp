-- Energy system for predictions
-- Energy refills 10 units every 15 minutes for regular users
-- Tier 4/5 NFT holders get 10 units every 10 minutes

-- Energy balances table
CREATE TABLE IF NOT EXISTS energy_balances (
  user_address TEXT PRIMARY KEY,
  energy NUMERIC NOT NULL DEFAULT 100, -- Start with max energy (100)
  max_energy NUMERIC NOT NULL DEFAULT 100, -- Maximum energy capacity
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure lowercased addresses
CREATE OR REPLACE FUNCTION normalize_energy_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_address := LOWER(NEW.user_address);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_energy_normalize ON energy_balances;
CREATE TRIGGER trg_energy_normalize 
  BEFORE INSERT OR UPDATE ON energy_balances
  FOR EACH ROW EXECUTE FUNCTION normalize_energy_address();

-- Function to calculate current energy with refill
-- Energy refills 10 units every 15 minutes (900 seconds) for regular users
-- Tier 4/5 NFT holders get 10 units every 10 minutes (600 seconds)
-- Returns the current energy after applying refills
CREATE OR REPLACE FUNCTION get_current_energy(p_user TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_energy NUMERIC;
  v_max_energy NUMERIC;
  v_last_refill TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_seconds_elapsed NUMERIC;
  v_energy_to_add NUMERIC;
  v_new_energy NUMERIC;
  v_refill_interval NUMERIC;
  v_refill_amount NUMERIC;
  v_minted_tier INTEGER;
BEGIN
  -- Get or create user energy record
  INSERT INTO energy_balances(user_address, energy, max_energy, last_refill_at)
  VALUES (LOWER(p_user), 100, 100, NOW())
  ON CONFLICT (user_address) DO NOTHING;
  
  -- Get current values
  SELECT energy, max_energy, last_refill_at
  INTO v_energy, v_max_energy, v_last_refill
  FROM energy_balances
  WHERE user_address = LOWER(p_user);
  
  -- If no record found (shouldn't happen after insert), return max
  IF v_energy IS NULL THEN
    RETURN 100;
  END IF;
  
  -- Check if user has tier 4 or 5 NFT
  SELECT minted_tier INTO v_minted_tier
  FROM eligibility
  WHERE address = LOWER(p_user);
  
  -- Set refill rate based on NFT tier
  -- Tier 4/5: 10 energy every 10 minutes (600 seconds)
  -- Others: 10 energy every 15 minutes (900 seconds)
  IF v_minted_tier IS NOT NULL AND v_minted_tier >= 4 THEN
    v_refill_interval := 600; -- 10 minutes
    v_refill_amount := 10;
  ELSE
    v_refill_interval := 900; -- 15 minutes
    v_refill_amount := 10;
  END IF;
  
  v_now := NOW();
  v_seconds_elapsed := EXTRACT(EPOCH FROM (v_now - v_last_refill));
  
  -- Calculate how many refill cycles have passed
  -- Each cycle gives v_refill_amount energy
  v_energy_to_add := FLOOR(v_seconds_elapsed / v_refill_interval) * v_refill_amount;
  
  -- Cap at max energy
  v_new_energy := LEAST(v_energy + v_energy_to_add, v_max_energy);
  
  -- If energy increased, update the record
  IF v_new_energy > v_energy THEN
    UPDATE energy_balances
    SET 
      energy = v_new_energy,
      last_refill_at = v_last_refill + (FLOOR(v_seconds_elapsed / v_refill_interval) * (v_refill_interval || ' seconds')::INTERVAL),
      updated_at = v_now
    WHERE user_address = LOWER(p_user);
    
    RETURN v_new_energy;
  END IF;
  
  RETURN v_energy;
END;
$$ LANGUAGE plpgsql;

-- Atomically spend energy (30 energy per prediction)
-- Returns true if success, false if insufficient energy
CREATE OR REPLACE FUNCTION spend_energy(p_user TEXT, p_amount NUMERIC DEFAULT 30)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_energy NUMERIC;
  v_new_energy NUMERIC;
  ok INTEGER;
BEGIN
  -- Get current energy (with refill applied)
  v_current_energy := get_current_energy(p_user);
  
  -- Check if user has enough energy
  IF v_current_energy < p_amount THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct energy
  v_new_energy := v_current_energy - p_amount;
  
  UPDATE energy_balances
  SET 
    energy = v_new_energy,
    updated_at = NOW()
  WHERE user_address = LOWER(p_user);
  
  GET DIAGNOSTICS ok = ROW_COUNT;
  RETURN ok > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get energy info (current, max, next refill time)
CREATE OR REPLACE FUNCTION get_energy_info(p_user TEXT)
RETURNS JSONB AS $$
DECLARE
  v_energy NUMERIC;
  v_max_energy NUMERIC;
  v_last_refill TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_seconds_elapsed NUMERIC;
  v_seconds_until_next_refill NUMERIC;
  v_current_energy NUMERIC;
  v_refill_interval NUMERIC;
  v_refill_amount NUMERIC;
  v_minted_tier INTEGER;
  v_refill_cycles_passed NUMERIC;
BEGIN
  -- Get or create user energy record
  INSERT INTO energy_balances(user_address, energy, max_energy, last_refill_at)
  VALUES (LOWER(p_user), 100, 100, NOW())
  ON CONFLICT (user_address) DO NOTHING;
  
  -- Get current values
  SELECT energy, max_energy, last_refill_at
  INTO v_energy, v_max_energy, v_last_refill
  FROM energy_balances
  WHERE user_address = LOWER(p_user);
  
  -- Check if user has tier 4 or 5 NFT
  SELECT minted_tier INTO v_minted_tier
  FROM eligibility
  WHERE address = LOWER(p_user);
  
  -- Set refill rate based on NFT tier
  -- Tier 4/5: 10 energy every 10 minutes (600 seconds)
  -- Others: 10 energy every 15 minutes (900 seconds)
  IF v_minted_tier IS NOT NULL AND v_minted_tier >= 4 THEN
    v_refill_interval := 600; -- 10 minutes
    v_refill_amount := 10;
  ELSE
    v_refill_interval := 900; -- 15 minutes
    v_refill_amount := 10;
  END IF;
  
  IF v_energy IS NULL THEN
    RETURN jsonb_build_object(
      'energy', 100,
      'max_energy', 100,
      'next_refill_in', v_refill_interval,
      'is_full', true
    );
  END IF;
  
  v_now := NOW();
  v_seconds_elapsed := EXTRACT(EPOCH FROM (v_now - v_last_refill));
  
  -- Calculate how many refill cycles have passed
  v_refill_cycles_passed := FLOOR(v_seconds_elapsed / v_refill_interval);
  
  -- Calculate current energy with refills
  v_current_energy := LEAST(v_energy + (v_refill_cycles_passed * v_refill_amount), v_max_energy);
  
  -- Calculate seconds until next refill
  IF v_current_energy >= v_max_energy THEN
    v_seconds_until_next_refill := 0;
  ELSE
    v_seconds_until_next_refill := v_refill_interval - (v_seconds_elapsed % v_refill_interval);
  END IF;
  
  -- Update if energy increased
  IF v_current_energy > v_energy THEN
    UPDATE energy_balances
    SET 
      energy = v_current_energy,
      last_refill_at = v_last_refill + (v_refill_cycles_passed * (v_refill_interval || ' seconds')::INTERVAL),
      updated_at = v_now
    WHERE user_address = LOWER(p_user);
  END IF;
  
  RETURN jsonb_build_object(
    'energy', v_current_energy,
    'max_energy', v_max_energy,
    'next_refill_in', v_seconds_until_next_refill,
    'is_full', v_current_energy >= v_max_energy
  );
END;
$$ LANGUAGE plpgsql;

-- Function to grant/refund energy (for rollbacks)
CREATE OR REPLACE FUNCTION grant_energy(p_user TEXT, p_amount NUMERIC)
RETURNS VOID AS $$
DECLARE
  v_current_energy NUMERIC;
  v_max_energy NUMERIC;
BEGIN
  -- Get current energy (with refill applied)
  v_current_energy := get_current_energy(p_user);
  
  -- Get max energy
  SELECT max_energy INTO v_max_energy
  FROM energy_balances
  WHERE user_address = LOWER(p_user);
  
  IF v_max_energy IS NULL THEN
    v_max_energy := 100;
  END IF;
  
  -- Add energy, cap at max
  UPDATE energy_balances
  SET 
    energy = LEAST(v_current_energy + GREATEST(p_amount, 0), v_max_energy),
    updated_at = NOW()
  WHERE user_address = LOWER(p_user);
END;
$$ LANGUAGE plpgsql;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_energy_balances_user ON energy_balances(user_address);

-- Grant permissions to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE ON energy_balances TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_current_energy(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION spend_energy(TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_energy(TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_energy_info(TEXT) TO anon, authenticated;

-- Make functions security definer so they can access the table
ALTER FUNCTION get_current_energy(TEXT) SECURITY DEFINER;
ALTER FUNCTION spend_energy(TEXT, NUMERIC) SECURITY DEFINER;
ALTER FUNCTION grant_energy(TEXT, NUMERIC) SECURITY DEFINER;
ALTER FUNCTION get_energy_info(TEXT) SECURITY DEFINER;

