# BaseScan API Integration Guide

## Overview
BaseScan is the Base blockchain explorer (similar to Etherscan). Their API can provide accurate transaction counts and other metrics.

## Getting an API Key

1. Visit https://basescan.org/apis
2. Sign up for a free account
3. Get your API key
4. Add to `.env`: `BASESCAN_API_KEY=your_key_here`

## API Endpoints

BaseScan API follows Etherscan API structure. Key endpoints:

### 1. Get Daily Transaction Count
```typescript
// Get transaction count for a specific date
const dateStr = "2024-11-13"; // YYYY-MM-DD
const response = await fetch(
  `https://api.basescan.org/api?module=stats&action=dailytxncount&startdate=${dateStr}&enddate=${dateStr}&apikey=${BASESCAN_API_KEY}`
);
```

### 2. Get Block Range for Date
```typescript
// Get first and last block for a date
const timestamp = Math.floor(new Date("2024-11-13").getTime() / 1000);
const response = await fetch(
  `https://api.basescan.org/api?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before&apikey=${BASESCAN_API_KEY}`
);
```

### 3. Get Transaction Count in Block Range
```typescript
// Count transactions between two blocks
const response = await fetch(
  `https://api.basescan.org/api?module=proxy&action=eth_getBlockTransactionCountByNumber&tag=${blockHex}&apikey=${BASESCAN_API_KEY}`
);
```

## Implementation Example

Here's how to implement `fetchTransactionCountFromBaseScan`:

```typescript
async function fetchTransactionCountFromBaseScan(
  startTimestamp: number,
  endTimestamp: number
): Promise<number | null> {
  if (!BASESCAN_API_KEY) {
    return null;
  }

  try {
    const startDate = new Date(startTimestamp * 1000);
    const endDate = new Date(endTimestamp * 1000);
    
    // If same day, use daily stats endpoint
    if (startDate.toDateString() === endDate.toDateString()) {
      const dateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const response = await fetch(
        `https://api.basescan.org/api?module=stats&action=dailytxncount&startdate=${dateStr}&enddate=${dateStr}&apikey=${BASESCAN_API_KEY}`
      );
      
      const data = await response.json();
      if (data.status === '1' && data.result) {
        return parseInt(data.result, 10);
      }
    }
    
    // For multi-day ranges, sum daily counts
    // Or use block range method
    return null;
  } catch (error) {
    console.warn("[auto-resolve] BaseScan API error:", error);
    return null;
  }
}
```

## Alternative: Dune Analytics

Dune Analytics has excellent Base chain data and might be easier to use:

1. Create a Dune query for Base daily transaction counts
2. Get API key from https://dune.com/settings/api
3. Use Dune API: `https://api.dune.com/api/v1/query/{query_id}/results`

## Rate Limits

- BaseScan free tier: 5 calls/second
- Consider caching results
- Add retry logic with exponential backoff


