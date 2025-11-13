# Database Setup Guide

This document explains the complete database schema for the Kalshi MiniApp project.

## Quick Start

1. Open your Supabase SQL Editor
2. Run `COMPLETE_DATABASE_SCHEMA.sql` in order
3. Verify tables were created successfully

## Database Structure Overview

### 1. **Wallet Stats & Eligibility** (`001.sql`)
Tracks wallet statistics and tier eligibility for NFT minting.

**Tables:**
- `wallet_stats` - On-chain wallet statistics (tx count, ERC20 holdings, NFTs, etc.)
- `eligibility` - Tier eligibility and minted NFT tracking

**Key Fields:**
- `tier` - Current eligible tier (0-4)
- `minted_tier` - Tier that was actually minted
- `minted_token_id` - NFT token ID
- `minted_animal` - Animal name for the tier
- `minted_metadata_url` - IPFS metadata URL

### 2. **Points System** (`supabase_points.sql`)
Manages the points balance system for staking predictions.

**Tables:**
- `points_balances` - User points balances

**Functions:**
- `grant_points(p_user, p_amount)` - Atomically add points
- `spend_points(p_user, p_amount)` - Atomically spend points (returns boolean)

**Usage:**
```sql
-- Grant points
SELECT grant_points('0x123...', 100);

-- Spend points
SELECT spend_points('0x123...', 50);
```

### 3. **Predictions System** (`supabase_predictions.sql`)
Main prediction system for Kalshi markets.

**Tables:**
- `markets` - Cached Kalshi market metadata
- `periods` - Vault accounting periods
- `predictions` - User predictions (EIP-712 signed)
- `outcomes` - Market resolution outcomes
- `distributions` - Payout distributions

**Key Relationships:**
- `predictions.period_id` → `periods.period_id`
- `predictions.market_id` → `outcomes.market_id`
- `distributions.period_id` → `periods.period_id`

**Settlement Fields (from migration):**
- `settled` - Whether prediction has been settled
- `settled_at` - Settlement timestamp
- `won` - Whether prediction won (true/false)

**Market Metadata (from migration):**
- `market_title` - Human-readable title
- `market_ticker` - Kalshi ticker (e.g., YES-2024-ELECTION)

### 4. **Base Daily Predictions** (`supabase_base_daily.sql`)
Daily Base chain prediction markets with automatic point awards.

**Tables:**
- `base_daily_entries` - User predictions for daily markets
- `base_daily_outcomes` - Market outcomes
- `base_daily_sessions` - Session tracking (open/locked/settled/break)
- `base_daily_metrics_cache` - Metrics snapshot cache
- `base_daily_settlements` - Settlement log

**Views:**
- `v_base_daily_winners` - Calculates winners for each market

**Functions:**
- `award_base_daily_market(p_session, p_market)` - Awards points to winners

**Session Phases:**
- `open` - Trading is open
- `locked` - Locked for review
- `settled` - Outcomes resolved
- `break` - Break window between sessions

## Migration Files

### `supabase_migration.sql`
Adds minted NFT tracking columns to `eligibility` table.

### `supabase_predictions_migration.sql`
Adds settlement tracking fields to `predictions` table.

### `supabase_predictions_add_title.sql`
Adds market title and ticker to `predictions` table.

### `supabase_base_daily_migration.sql`
Converts `session_id` from DATE to TEXT to support test mode (YYYY-MM-DD-HH-MM format).

### `create_period.sql`
Creates default period for testing.

## Common Queries

### Get User Points
```sql
SELECT points FROM points_balances WHERE user_address = LOWER('0x...');
```

### Get User Predictions
```sql
SELECT * FROM predictions 
WHERE user_address = LOWER('0x...') 
ORDER BY created_at DESC;
```

### Get Unsettled Predictions
```sql
SELECT * FROM predictions 
WHERE settled = FALSE 
ORDER BY created_at DESC;
```

### Get Market Outcomes
```sql
SELECT * FROM outcomes 
WHERE resolved = TRUE 
ORDER BY settlement_ts DESC;
```

### Get Base Daily Session Status
```sql
SELECT * FROM base_daily_sessions 
ORDER BY updated_at DESC 
LIMIT 1;
```

### Get Base Daily Winners
```sql
SELECT * FROM v_base_daily_winners 
WHERE session_id = '2024-01-15' 
AND market_id = 'market-1';
```

### Award Base Daily Market
```sql
SELECT award_base_daily_market('2024-01-15', 'market-1');
```

## Indexes

All tables have appropriate indexes for:
- Foreign key lookups
- User address queries
- Market ID queries
- Settlement status queries
- Session queries

## Triggers

- `normalize_points_address()` - Ensures lowercase addresses in points_balances
- `normalize_base_daily_entry()` - Ensures lowercase addresses in base_daily_entries
- `touch_base_daily_outcome()` - Auto-updates resolved_at timestamp
- `touch_base_daily_session()` - Auto-updates updated_at timestamp

## Security

- All functions use `SECURITY DEFINER` where appropriate
- Addresses are normalized to lowercase via triggers
- Unique constraints prevent duplicate predictions (user_address, nonce)
- Advisory locks prevent race conditions in award functions

## Notes

1. **Session ID Format**: Base daily sessions use TEXT to support both production (YYYY-MM-DD) and test mode (YYYY-MM-DD-HH-MM)

2. **Cross-Period Settlements**: Predictions can be settled even after their period closes, allowing for delayed market resolutions

3. **Points System**: Points are atomic via database functions to prevent race conditions

4. **Market IDs**: Can be either keccak256(ticker) hash or ticker itself depending on usage

5. **EIP-712 Signatures**: Predictions are signed off-chain and verified server-side before insertion

