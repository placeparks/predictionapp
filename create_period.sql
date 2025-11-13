-- Create a period for testing predictions
-- Run this in your Supabase SQL Editor

-- First, check if period 1 exists
SELECT * FROM periods WHERE period_id = 1;

-- If it doesn't exist, create it:
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

-- Verify it was created
SELECT * FROM periods WHERE period_id = 1;


