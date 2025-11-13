# Settlement System - Cross-Period Settlements

## Overview

This system implements **Option 2: Allow Cross-Period Settlements**, which means:
- **Periods can close after 30 days** (or any set duration)
- **Predictions can still be settled later** when Kalshi markets resolve (even if the period is already closed)
- **Distributions reference the original period_id** (so you know when the prediction was made)

## How It Works

### 1. Period Lifecycle

```
Period 1 (Day 1-30):
  - Status: 'open'
  - Users make predictions
  - Day 30: Period can be closed (status: 'closed')
  - But predictions can still be settled later!
```

### 2. Settlement Process

When a Kalshi market resolves:

1. **Call `/api/settle`** with:
   ```json
   {
     "market_id": "0x...",
     "outcome_yes": true  // or false
   }
   ```

2. **The API will:**
   - Find all unsettled predictions for that market
   - Mark them as settled (regardless of period status)
   - Create distribution records referencing the original `period_id`
   - Update the outcomes table

3. **Example:**
   - Prediction made in Period 1 (Day 5)
   - Period 1 closes (Day 30)
   - Market resolves (Day 60)
   - Settlement happens → Distribution goes to Period 1

### 3. Database Schema

**New fields in `predictions` table:**
- `settled` (boolean) - Whether prediction has been settled
- `settled_at` (timestamp) - When it was settled
- `won` (boolean) - Whether the prediction won

**Migration:**
Run `supabase_predictions_migration.sql` to add these fields.

## API Endpoints

### POST `/api/settle`
Settle predictions for a market when it resolves.

**Request:**
```json
{
  "market_id": "0x...",
  "outcome_yes": true
}
```

**Response:**
```json
{
  "ok": true,
  "settled": {
    "market_id": "0x...",
    "outcome_yes": true,
    "total_predictions": 10,
    "winners": 6,
    "losers": 4,
    "distributions_created": 3,
    "periods_affected": 2
  }
}
```

### GET `/api/periods/check-close?period_id=1`
Check if a period can be closed (shows unsettled predictions count).

**Response:**
```json
{
  "ok": true,
  "period": {
    "period_id": 1,
    "status": "open",
    "starts_at": "...",
    "ends_at": "..."
  },
  "predictions": {
    "total": 50,
    "unsettled": 10,
    "settled": 40
  },
  "can_close": false,
  "warning": "Period has 10 unsettled predictions. They can still be settled later even after the period closes (cross-period settlement)."
}
```

## Benefits

✅ **Flexible**: Handles real-world scenarios where markets take time to resolve  
✅ **Periods close on schedule**: Accounting periods can close after 30 days  
✅ **Late settlements work**: Predictions can be settled even after period closes  
✅ **Clear accounting**: Distributions reference original period for tracking  

## Example Flow

1. **Day 1**: User makes prediction in Period 1
2. **Day 30**: Period 1 closes (status: 'closed')
3. **Day 60**: Kalshi market resolves
4. **Day 60**: Call `/api/settle` → Prediction is settled
5. **Day 60**: Distribution created for Period 1 (original period)
6. **Day 60**: User receives payout (even though Period 1 is closed)

## Automatic Resolution Checking

The system now includes automatic resolution checking that polls Kalshi for resolved markets and settles predictions automatically.

### API Endpoint

**POST `/api/settle/check`**
Automatically checks all markets with unsettled predictions and settles them if they've been resolved on Kalshi.

**Response:**
```json
{
  "ok": true,
  "summary": {
    "checked": 10,
    "settled": 3,
    "skipped": 6,
    "errors": 1
  },
  "details": [
    {
      "market_id": "0x...",
      "ticker": "YES-2024-ELECTION",
      "status": "settled",
      "outcome": true
    }
  ]
}
```

### Scripts

**One-time check:**
```bash
npm run check-resolutions
```

**Continuous watcher (checks every 5 minutes):**
```bash
npm run check-resolutions:watch
```

### Setting Up Automatic Checks

**Option 1: Cron Job (Recommended for Production)**
Add to your crontab to check every 15 minutes:
```bash
*/15 * * * * cd /path/to/app && npm run check-resolutions
```

**Option 2: Background Watcher**
Run the watcher script as a background service:
```bash
npm run check-resolutions:watch
```

**Option 3: Vercel Cron Jobs (Automatic on Vercel)**
The `vercel.json` file is already configured with a cron job that runs every 15 minutes:
```json
{
  "crons": [
    {
      "path": "/api/settle/check",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

When you deploy to Vercel, this will automatically run every 15 minutes. No additional setup needed!

**Option 4: External Scheduled API Calls**
Use a service like GitHub Actions, external cron services, or similar to call:
```
POST https://your-app.com/api/settle/check
```

### How It Works

1. The checker queries the database for all markets with unsettled predictions
2. For each market, it checks the Kalshi API for current status
3. If a market is `settled` on Kalshi, it determines the outcome:
   - `yes_price = 100` → YES won
   - `no_price = 100` → NO won
4. Automatically calls `/api/settle` with the correct outcome
5. Marks settlements with `source: "auto_settlement"` for tracking

## Migration Steps

1. Run `supabase_predictions_migration.sql` in Supabase SQL Editor
2. The settlement API is ready to use
3. Periods can now be closed even with unsettled predictions
4. Set up automatic resolution checking (see above)


