# Referral System Setup Guide

## SQL Files Required

You need **BOTH** SQL files, run in this order:

### 1. `supabase_referrals.sql` (Run First)
This is the **base referral system** that includes:
- `referrals` table - Tracks referral relationships
- `genesis_users` table - Tracks Genesis users and Genesis Ring status
- Functions for:
  - Creating referrals
  - Processing rewards (100 BET to referrer, 50 BET to new user)
  - Checking referral activity (3-day betting requirement)
  - Genesis Ring multiplier (3x BET tokens)
- Triggers for automatic activity tracking

### 2. `supabase_referral_codes.sql` (Run Second)
This **extends** the referral system with secure referral codes:
- `referral_codes` table - Stores unique codes (PROPH-XXXXX format)
- Adds `referral_code` column to `referrals` table
- Functions for:
  - Generating unique referral codes
  - Validating and using codes
  - Tracking code usage
  - Creating referrals from codes

**Important:** This file depends on the `referrals` table from the first file, so it must be run after `supabase_referrals.sql`.

## Setup Steps

1. **Run `supabase_referrals.sql`** in your Supabase SQL Editor
2. **Run `supabase_referral_codes.sql`** in your Supabase SQL Editor
3. **Run `fix_energy_permissions.sql`** to grant all necessary permissions

## Why Both Files?

- **`supabase_referrals.sql`**: Core referral functionality (rewards, Genesis Ring, activity tracking)
- **`supabase_referral_codes.sql`**: Secure code generation and validation layer on top

The referral code system is an **enhancement** that adds security and tracking, but the base referral system is still needed for:
- Reward processing
- Genesis Ring functionality
- Activity tracking
- All the business logic

## Permission Fix

After running both SQL files, run `fix_energy_permissions.sql` which now includes:
- Base Daily tables permissions (fixes the `base_daily_entries` error)
- Referral code system permissions
- All existing permissions (energy, referrals, etc.)

## Testing

After setup:
1. Visit `/referrals` page
2. Click "Generate New Code" to create a referral code
3. Share the code (e.g., `PROPH-ABC123XY`) or the full link
4. Test using the code on the main page or via URL parameter `?ref=PROPH-ABC123XY`

