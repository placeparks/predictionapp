-- Add block number tracking for Base Daily sessions
-- This allows us to store exact block ranges for each session date
-- and use them for accurate historical data queries

ALTER TABLE base_daily_sessions
ADD COLUMN IF NOT EXISTS start_block BIGINT,
ADD COLUMN IF NOT EXISTS end_block BIGINT;

COMMENT ON COLUMN base_daily_sessions.start_block IS 'First block number for the session date (00:00 UTC)';
COMMENT ON COLUMN base_daily_sessions.end_block IS 'Last block number for the session date (23:59:59 UTC)';

CREATE INDEX IF NOT EXISTS idx_base_daily_sessions_blocks 
  ON base_daily_sessions(start_block, end_block) 
  WHERE start_block IS NOT NULL AND end_block IS NOT NULL;

