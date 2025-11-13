-- Migration: Add minted tier tracking to eligibility table
-- Run this in your Supabase SQL editor

-- Add columns to eligibility table to track minted NFTs
ALTER TABLE eligibility
ADD COLUMN IF NOT EXISTS minted_tier INTEGER,
ADD COLUMN IF NOT EXISTS minted_animal TEXT,
ADD COLUMN IF NOT EXISTS minted_token_id INTEGER,
ADD COLUMN IF NOT EXISTS minted_metadata_url TEXT,
ADD COLUMN IF NOT EXISTS minted_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN eligibility.minted_tier IS 'Tier that was actually minted as NFT (snapshot at mint time)';
COMMENT ON COLUMN eligibility.minted_animal IS 'Animal name for the minted tier';
COMMENT ON COLUMN eligibility.minted_token_id IS 'Token ID of the minted NFT';
COMMENT ON COLUMN eligibility.minted_metadata_url IS 'IPFS/Pinata URL of the minted NFT metadata';
COMMENT ON COLUMN eligibility.minted_at IS 'Timestamp when the NFT was minted';

-- Note: tier column represents current eligible tier
-- Note: minted_tier represents the tier that was actually minted (may be different from current tier)
