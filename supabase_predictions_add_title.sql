-- Add market title and ticker to predictions table for better UX
-- This allows users to see which prediction they bet on

ALTER TABLE predictions 
ADD COLUMN IF NOT EXISTS market_title TEXT,
ADD COLUMN IF NOT EXISTS market_ticker TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_predictions_market_ticker ON predictions(market_ticker);

COMMENT ON COLUMN predictions.market_title IS 'Human-readable title of the prediction market';
COMMENT ON COLUMN predictions.market_ticker IS 'Kalshi market ticker (e.g., YES-2024-ELECTION)';

