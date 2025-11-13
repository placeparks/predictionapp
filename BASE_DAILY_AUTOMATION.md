# Base Daily Predictions - Automated Resolution

This document explains how the automated resolution system works for Base Daily predictions.

## Overview

The system automatically:
1. **Collects predictions** from users during the day (already working)
2. **Closes the session** at the end of the day
3. **Fetches Base blockchain data** when the session closes
4. **Determines outcomes** for each market based on the fetched data
5. **Awards points** to users who predicted correctly

## Architecture

### API Endpoint

The automated resolution endpoint is located at:
```
POST /api/base-daily/auto-resolve
```

This endpoint:
- Requires admin authentication (`x-admin-key` header)
- Fetches Base blockchain metrics for a session
- Determines outcomes for each market
- Calls the resolve endpoint to set outcomes and award points

### Current Implementation

The endpoint currently fetches:
- ✅ **Active addresses** - Counts unique addresses from transactions
- ✅ **Total transactions** - Counts transactions in the session period
- ✅ **Average gas price** - Gets average gas price from blocks
- ✅ **New contracts** - Counts contract creations
- ✅ **NFT mints** - Counts ERC721/1155 mints
- ✅ **Average confirmation time** - Uses Base's typical ~2 second confirmation
- ✅ **Gas savings** - Uses Base's typical ~95% savings vs L1

**Note:** Some metrics require external API integrations:
- ⚠️ **DEX volume** - Needs DEX API integration (Uniswap, etc.)
- ⚠️ **Net bridge inflow** - Needs bridge API integration
- ⚠️ **TVL growth** - Needs DeFi API integration (DeFiLlama, etc.)

These markets will be skipped if the data cannot be determined.

## Setup

### 1. Environment Variables

Ensure these are set in Vercel:
```bash
ALCHEMY_API_KEY=your_alchemy_api_key
BASE_DAILY_ADMIN_KEY=your_admin_key
CRON_SECRET=your_cron_secret  # Optional: for cron job authentication
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app  # For production
```

**Note:** For Vercel cron jobs, you can either:
- Use `BASE_DAILY_ADMIN_KEY` in the cron request (if supported)
- Set `CRON_SECRET` and configure Vercel to send it in headers
- Or modify the endpoint to allow internal Vercel calls

### 2. Deploy to Vercel

The `vercel.json` file includes a cron job configuration that runs daily at midnight UTC:

```json
{
  "crons": [
    {
      "path": "/api/base-daily/auto-resolve",
      "schedule": "0 0 * * *"
    }
  ]
}
```

This will automatically call the endpoint daily.

### 3. Manual Trigger (for testing)

You can also manually trigger the resolution:

```bash
curl -X POST https://your-app.vercel.app/api/base-daily/auto-resolve \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_KEY" \
  -d '{"sessionId": "2024-01-15"}'
```

Or use the script:
```bash
npx tsx scripts/resolve-base-daily-outcomes.ts 2024-01-15
```

## How It Works

1. **Session Timeline:**
   - **00:00 UTC** - Session break starts
   - **00:10 UTC** - Session opens (predictions allowed)
   - **23:55 UTC** - Session locks (predictions closed)
   - **00:00 UTC (next day)** - Session resolves (auto-resolve runs)

2. **Auto-Resolution Process:**
   - Cron job triggers at midnight UTC
   - Endpoint fetches Base blockchain data for the previous session
   - Determines outcomes for each market
   - Calls `/api/base-daily/resolve` for each market
   - Points are automatically awarded to winners

3. **Data Fetching:**
   - Uses Alchemy API to fetch Base blockchain data
   - Queries transactions, transfers, and blocks in the session time range
   - Calculates metrics from the fetched data

## Extending the System

### Adding External API Integrations

To add support for markets that require external APIs:

1. **DEX Volume:**
   - Integrate with Uniswap V3 API or DEX aggregator APIs
   - Query volume for Base DEXes in the session period
   - Update `fetchBaseMetrics()` to include DEX volume

2. **Bridge Data:**
   - Integrate with Base bridge APIs or on-chain bridge contracts
   - Calculate net inflow/outflow for the session
   - Update `fetchBaseMetrics()` to include bridge data

3. **TVL Growth:**
   - Integrate with DeFiLlama API or similar
   - Get TVL at session start and end
   - Calculate percentage change
   - Update `fetchBaseMetrics()` to include TVL change

### Example: Adding DEX Volume

```typescript
// In fetchBaseMetrics()
async function fetchDEXVolume(startTime: Date, endTime: Date): Promise<number> {
  // Call Uniswap V3 API or similar
  const response = await fetch(`https://api.uniswap.org/v3/volume/base?start=${startTime}&end=${endTime}`);
  const data = await response.json();
  return data.totalVolumeUSD || 0;
}

// Add to metrics
const dexVolume = await fetchDEXVolume(sessionStart, sessionEnd);
metrics.dexVolume = dexVolume;
```

## Monitoring

The endpoint returns detailed results:

```json
{
  "ok": true,
  "sessionId": "2024-01-15",
  "metrics": {
    "activeAddresses": 52341,
    "totalTransactions": 2100000,
    "avgGasPrice": 0.15,
    ...
  },
  "results": [
    {
      "marketId": "active-addresses",
      "outcome": "yes",
      "success": true,
      "awardedCount": 42
    },
    ...
  ],
  "summary": {
    "successful": 8,
    "skipped": 2,
    "failed": 0,
    "total": 10
  }
}
```

Check Vercel logs or your monitoring system to track:
- Successful resolutions
- Skipped markets (cannot determine)
- Failed resolutions
- Awarded points

## Troubleshooting

### Endpoint not running
- Check Vercel cron job is enabled
- Verify `BASE_DAILY_ADMIN_KEY` is set correctly
- Check Vercel logs for errors

### Metrics not accurate
- Verify `ALCHEMY_API_KEY` is valid
- Check Alchemy API rate limits
- Review block range calculations

### Markets not resolving
- Check if market requires external API (will be skipped)
- Verify session has predictions (no predictions = no resolution needed)
- Check logs for specific errors

## Security

- The endpoint requires admin authentication
- Never expose `BASE_DAILY_ADMIN_KEY` in client-side code
- Use environment variables for all secrets
- Monitor for unauthorized access attempts

