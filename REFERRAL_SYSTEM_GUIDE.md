# Referral System & Genesis Ring Guide

## Overview

The referral system rewards users for bringing in new users, with special benefits for Genesis users who build active referral streaks.

## Features

### 1. **Referral Rewards**
- **Referrer**: Gets 100 BET tokens when they refer a new user
- **Referred User**: Gets 50 BET tokens when they sign up via referral

### 2. **Active Referrals**
- A referral becomes "active" when the referred user has been betting for **more than 3 days**
- Activity is automatically tracked via triggers when users make predictions

### 3. **Genesis Ring**
- **Genesis users** with **5+ active referrals** unlock the **Genesis Ring**
- Genesis Ring provides **3x BET token multiplier** (triple BET week)
- This multiplier applies to all BET token rewards (Base Daily wins, etc.)

## Database Schema

### Tables

#### `referrals`
Tracks referral relationships and rewards:
- `referrer_address` - The user who referred
- `referred_address` - The new user who was referred
- `first_bet_at` - When referred user made their first bet
- `active_at` - When referral became active (betting > 3 days)
- `is_active` - Whether referral is active
- `referrer_rewarded` / `referred_rewarded` - Reward tracking

#### `genesis_users`
Tracks Genesis users and Genesis Ring status:
- `address` - User address
- `is_genesis` - Whether user is a Genesis user
- `genesis_ring_unlocked` - Whether Genesis Ring is unlocked
- `active_referral_streak` - Count of active referrals (for Genesis Ring eligibility)

## Functions

### `create_referral(p_referrer_address, p_referred_address)`
Creates a new referral relationship.

**Example:**
```sql
SELECT create_referral('0x123...', '0x456...');
```

### `process_referral_rewards(p_referred_address)`
Processes referral rewards (100 to referrer, 50 to referred user).

**Example:**
```sql
SELECT process_referral_rewards('0x456...');
```

### `check_referral_activity(p_referred_address)`
Checks if a referral is active (betting > 3 days). Automatically called via triggers.

### `update_genesis_referral_streak(p_genesis_address)`
Updates Genesis user's active referral streak and unlocks Genesis Ring if 5+ active.

### `set_genesis_user(p_address)`
Marks a user as a Genesis user.

**Example:**
```sql
SELECT set_genesis_user('0x123...');
```

### `get_bet_token_multiplier(p_address)`
Returns BET token multiplier (1 for normal users, 3 for Genesis Ring users).

**Example:**
```sql
SELECT get_bet_token_multiplier('0x123...'); -- Returns 1 or 3
```

## Views

### `v_genesis_ring_status`
Shows Genesis Ring status for all Genesis users:
- Active referral streak count
- Total referrals
- Genesis Ring unlock status

**Example:**
```sql
SELECT * FROM v_genesis_ring_status;
```

### `v_referrals_with_status`
Shows all referrals with activity status:
- Status: `no_bets`, `pending`, `active`, or `inactive`
- Reward status
- Genesis status of referrer

**Example:**
```sql
SELECT * FROM v_referrals_with_status WHERE referrer_address = '0x123...';
```

## Usage Examples

### 1. Create a Referral
```sql
-- User 0x123 refers user 0x456
SELECT create_referral('0x123...', '0x456...');
```

### 2. Process Rewards (typically done when referred user signs up)
```sql
-- Process rewards for referred user
SELECT process_referral_rewards('0x456...');
```

### 3. Mark a User as Genesis
```sql
-- Mark user as Genesis (e.g., early adopters)
SELECT set_genesis_user('0x123...');
```

### 4. Check Genesis Ring Status
```sql
-- See all Genesis users and their ring status
SELECT * FROM v_genesis_ring_status;
```

### 5. Check Referral Activity
```sql
-- Manually check if a referral is active
SELECT check_referral_activity('0x456...');
```

## Automatic Features

### Triggers
- **Automatic Activity Tracking**: When a user makes a prediction (Kalshi or Base Daily), the system automatically checks if they're a referred user and updates referral activity
- **Genesis Ring Unlock**: When a referral becomes active, if the referrer is a Genesis user, their streak is automatically updated and Genesis Ring is unlocked if they reach 5+ active referrals

## Genesis Ring Multiplier

When a Genesis user unlocks the Genesis Ring:
- All BET token rewards are multiplied by **3x**
- This applies to:
  - Base Daily prediction wins
  - Any other BET token rewards in the system

The multiplier is automatically applied via the `get_bet_token_multiplier()` function.

## Setup

1. Run `COMPLETE_DATABASE_SCHEMA.sql` first
2. Run `supabase_referrals.sql` to set up the referral system
3. Mark early users as Genesis users using `set_genesis_user()`

## Notes

- Each user can only be referred once (enforced by unique constraint)
- Users cannot refer themselves
- Referral activity is tracked automatically via triggers
- Genesis Ring multiplier applies to all BET token rewards system-wide

