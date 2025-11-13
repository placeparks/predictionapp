-- Migration: Add settlement fields to predictions table
-- This allows cross-period settlements (settle predictions even after period closes)

-- Add settlement tracking fields
ALTER TABLE predictions 
ADD COLUMN IF NOT EXISTS settled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS won BOOLEAN;

-- Add index for faster settlement queries
CREATE INDEX IF NOT EXISTS idx_predictions_settled ON predictions(settled, market_id);
CREATE INDEX IF NOT EXISTS idx_predictions_period_settled ON predictions(period_id, settled);

-- Add comment explaining the cross-period settlement design
COMMENT ON COLUMN predictions.settled IS 'Whether this prediction has been settled (can be settled even after period closes)';
COMMENT ON COLUMN predictions.settled_at IS 'Timestamp when prediction was settled';
COMMENT ON COLUMN predictions.won IS 'Whether the prediction won (true) or lost (false)';

