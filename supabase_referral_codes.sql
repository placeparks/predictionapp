-- ============================================================================
-- REFERRAL CODE SYSTEM
-- ============================================================================
-- Secure referral codes with unique generation, usage tracking, and validation
-- ============================================================================

-- Referral codes table - stores unique referral codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- Unique referral code (e.g., "PROPH-ABC123XYZ")
  creator_address TEXT NOT NULL, -- Wallet address of the user who created this code
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usage_count INT NOT NULL DEFAULT 0, -- How many times this code has been used
  is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Whether code is still active
  last_used_at TIMESTAMPTZ, -- When code was last used
  -- Indexes
  CONSTRAINT referral_codes_code_key UNIQUE (code)
);

-- Normalize creator address
CREATE OR REPLACE FUNCTION normalize_referral_code_address()
RETURNS TRIGGER AS $$
BEGIN
  NEW.creator_address := LOWER(NEW.creator_address);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_codes_normalize ON referral_codes;
CREATE TRIGGER trg_referral_codes_normalize 
  BEFORE INSERT OR UPDATE ON referral_codes
  FOR EACH ROW EXECUTE FUNCTION normalize_referral_code_address();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_referral_codes_creator ON referral_codes(creator_address);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(is_active, creator_address);

-- Function to generate a unique referral code
-- Format: PROPH-XXXXX (where XXXXX is a random alphanumeric string)
CREATE OR REPLACE FUNCTION generate_referral_code(p_creator_address TEXT)
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
  v_attempts INT := 0;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Excludes confusing chars (0, O, I, 1)
  v_code_length INT := 8; -- 8 characters after "PROPH-"
BEGIN
  -- Validate address
  IF NOT (p_creator_address ~* '^0x[a-f0-9]{40}$') THEN
    RAISE EXCEPTION 'invalid_address';
  END IF;

  -- Generate unique code (retry if collision)
  LOOP
    v_code := 'PROPH-' || (
      SELECT string_agg(
        substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1),
        ''
      )
      FROM generate_series(1, v_code_length)
    );
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;
    
    IF NOT v_exists THEN
      EXIT; -- Found unique code
    END IF;
    
    v_attempts := v_attempts + 1;
    IF v_attempts > 100 THEN
      RAISE EXCEPTION 'failed_to_generate_unique_code';
    END IF;
  END LOOP;

  -- Insert the new code
  INSERT INTO referral_codes (code, creator_address)
  VALUES (v_code, LOWER(p_creator_address))
  ON CONFLICT (code) DO NOTHING
  RETURNING code INTO v_code;

  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate and use a referral code
-- Returns the creator's wallet address if valid, NULL otherwise
CREATE OR REPLACE FUNCTION validate_and_use_referral_code(p_code TEXT, p_user_address TEXT)
RETURNS TEXT AS $$
DECLARE
  v_creator_address TEXT;
  v_code_record RECORD;
BEGIN
  -- Validate inputs
  IF NOT (p_user_address ~* '^0x[a-f0-9]{40}$') THEN
    RAISE EXCEPTION 'invalid_user_address';
  END IF;

  -- Normalize code (uppercase, trim)
  p_code := UPPER(TRIM(p_code));

  -- Get code record
  SELECT creator_address, is_active, usage_count
  INTO v_code_record
  FROM referral_codes
  WHERE code = p_code;

  -- Check if code exists
  IF v_code_record IS NULL THEN
    RETURN NULL; -- Code doesn't exist
  END IF;

  -- Check if code is active
  IF NOT v_code_record.is_active THEN
    RETURN NULL; -- Code is inactive
  END IF;

  -- Check if user is trying to use their own code
  IF LOWER(v_code_record.creator_address) = LOWER(p_user_address) THEN
    RETURN NULL; -- Can't use own code
  END IF;

  -- Increment usage count and update last_used_at
  UPDATE referral_codes
  SET 
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE code = p_code;

  RETURN v_code_record.creator_address;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get referral codes for a creator
CREATE OR REPLACE FUNCTION get_user_referral_codes(p_creator_address TEXT)
RETURNS TABLE (
  code TEXT,
  created_at TIMESTAMPTZ,
  usage_count INT,
  is_active BOOLEAN,
  last_used_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rc.code,
    rc.created_at,
    rc.usage_count,
    rc.is_active,
    rc.last_used_at
  FROM referral_codes rc
  WHERE rc.creator_address = LOWER(p_creator_address)
  ORDER BY rc.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deactivate a referral code
CREATE OR REPLACE FUNCTION deactivate_referral_code(p_code TEXT, p_creator_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE referral_codes
  SET is_active = FALSE
  WHERE code = UPPER(TRIM(p_code))
    AND creator_address = LOWER(p_creator_address);
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update referrals table to include referral_code_id (optional, for tracking)
-- We'll keep referrer_address for backward compatibility, but also track the code used
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referral_code TEXT;
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);

-- Update create_referral function to accept referral code
CREATE OR REPLACE FUNCTION create_referral_from_code(p_referral_code TEXT, p_referred_address TEXT)
RETURNS JSONB AS $$
DECLARE
  v_referrer_address TEXT;
  v_referral_id UUID;
BEGIN
  -- Validate referral code and get creator address
  v_referrer_address := validate_and_use_referral_code(p_referral_code, p_referred_address);
  
  IF v_referrer_address IS NULL THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 
      'error', 'invalid_referral_code',
      'message', 'Invalid, inactive, or self-referral code'
    );
  END IF;

  -- Check if referred user already has a referrer
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_address = LOWER(p_referred_address)) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'already_referred');
  END IF;

  -- Create referral with code tracking
  INSERT INTO referrals (referrer_address, referred_address, referral_code)
  VALUES (LOWER(v_referrer_address), LOWER(p_referred_address), UPPER(TRIM(p_referral_code)))
  RETURNING id INTO v_referral_id;

  -- Check if referrer is Genesis and update their record
  IF NOT EXISTS (SELECT 1 FROM genesis_users WHERE address = LOWER(v_referrer_address)) THEN
    INSERT INTO genesis_users (address, is_genesis)
    VALUES (LOWER(v_referrer_address), FALSE)
    ON CONFLICT (address) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE, 
    'referral_id', v_referral_id,
    'referrer_address', v_referrer_address
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_and_use_referral_code(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_referral_codes(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_referral_code(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_referral_from_code(TEXT, TEXT) TO anon, authenticated, service_role;

-- Comments
COMMENT ON TABLE referral_codes IS 'Stores unique referral codes with usage tracking';
COMMENT ON COLUMN referral_codes.code IS 'Unique referral code (e.g., PROPH-ABC123XYZ)';
COMMENT ON COLUMN referral_codes.creator_address IS 'Wallet address of the user who created this code';
COMMENT ON COLUMN referral_codes.usage_count IS 'Number of times this code has been successfully used';
COMMENT ON FUNCTION generate_referral_code IS 'Generates a unique referral code for a user';
COMMENT ON FUNCTION validate_and_use_referral_code IS 'Validates a referral code and increments usage count. Returns creator address if valid, NULL otherwise';
COMMENT ON FUNCTION create_referral_from_code IS 'Creates a referral relationship using a referral code instead of direct wallet address';

