/**
 * Automation script to fetch Base blockchain data and resolve base daily outcomes
 * 
 * This script should be run as a cron job (e.g., daily at the resolution time)
 * 
 * Usage:
 *   npx tsx scripts/resolve-base-daily-outcomes.ts
 * 
 * Requires:
 *   - BASE_DAILY_ADMIN_KEY (or ADMIN_API_KEY or API_ADMIN_KEY) environment variable
 *   - ALCHEMY_API_KEY environment variable (for Base blockchain data)
 *   - NEXT_PUBLIC_APP_URL (or runs against localhost:3000)
 */

import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ADMIN_KEY =
  process.env.BASE_DAILY_ADMIN_KEY ||
  process.env.ADMIN_API_KEY ||
  process.env.API_ADMIN_KEY ||
  "";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";

// Base Mainnet RPC URL
const BASE_RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

interface MarketResolver {
  marketId: string;
  resolve: (data: BaseData) => Promise<boolean | null>; // null = cannot determine
}

interface BaseData {
  activeAddresses: number;
  totalTransactions: number;
  avgGasPrice: number; // in gwei
  dexVolume: number; // in USD
  netBridgeInflow: number; // in USD (positive = inflow, negative = outflow)
  newContracts: number;
  nftMints: number;
  avgConfirmationTime: number; // in seconds
  tvlChange: number; // percentage change
  gasSavings: number; // percentage savings vs L1
}

/**
 * Fetch Base blockchain data from various sources
 * NOTE: This is a simplified example - you'll need to implement actual data fetching
 * from Base blockchain APIs, DEX APIs, etc.
 */
async function fetchBaseData(sessionStart: Date, sessionEnd: Date): Promise<BaseData> {
  // TODO: Implement actual data fetching from:
  // - Base blockchain RPC (Alchemy, Infura, etc.)
  // - DEX APIs (Uniswap, etc.)
  // - Bridge APIs
  // - NFT APIs
  // - DeFi TVL APIs
  
  // This is a placeholder - replace with actual implementations
  console.log(`[Resolve] Fetching Base data for session ${sessionStart.toISOString()} to ${sessionEnd.toISOString()}`);
  
  // Example: Fetch active addresses using Alchemy
  // You would need to query transactions in the time range and count unique addresses
  
  return {
    activeAddresses: 0, // TODO: Fetch from blockchain
    totalTransactions: 0, // TODO: Fetch from blockchain
    avgGasPrice: 0, // TODO: Fetch from blockchain
    dexVolume: 0, // TODO: Fetch from DEX APIs
    netBridgeInflow: 0, // TODO: Fetch from bridge APIs
    newContracts: 0, // TODO: Fetch from blockchain
    nftMints: 0, // TODO: Fetch from NFT APIs
    avgConfirmationTime: 0, // TODO: Calculate from block data
    tvlChange: 0, // TODO: Fetch from DeFi APIs
    gasSavings: 0, // TODO: Calculate from gas price data
  };
}

/**
 * Market resolvers - determine outcome for each market based on Base data
 */
const marketResolvers: MarketResolver[] = [
  {
    marketId: "active-addresses",
    resolve: async (data) => {
      return data.activeAddresses >= 50000;
    },
  },
  {
    marketId: "total-transactions",
    resolve: async (data) => {
      return data.totalTransactions > 2_000_000;
    },
  },
  {
    marketId: "avg-gas-price",
    resolve: async (data) => {
      return data.avgGasPrice <= 0.2;
    },
  },
  {
    marketId: "dex-volume",
    resolve: async (data) => {
      return data.dexVolume > 50_000_000; // $50M
    },
  },
  {
    marketId: "net-bridge",
    resolve: async (data) => {
      return data.netBridgeInflow > 0;
    },
  },
  {
    marketId: "new-contracts",
    resolve: async (data) => {
      return data.newContracts >= 200;
    },
  },
  {
    marketId: "nft-mints",
    resolve: async (data) => {
      return data.nftMints > 20_000;
    },
  },
  {
    marketId: "average-confirmation",
    resolve: async (data) => {
      return data.avgConfirmationTime < 30;
    },
  },
  {
    marketId: "tvl-growth",
    resolve: async (data) => {
      return data.tvlChange > 0;
    },
  },
  {
    marketId: "gas-savings",
    resolve: async (data) => {
      return data.gasSavings > 95;
    },
  },
];

/**
 * Resolve a single market outcome
 */
async function resolveMarket(
  sessionId: string,
  marketId: string,
  outcome: boolean
): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/base-daily/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify({
        sessionId,
        marketId,
        outcome: outcome ? "yes" : "no",
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error(
        `[Resolve] Failed to resolve ${marketId}:`,
        data.error || data.message || data
      );
      return false;
    }

    console.log(
      `[Resolve] ✓ Resolved ${marketId} to ${outcome ? "yes" : "no"} (awarded: ${data.awardedCount || 0} winners)`
    );
    return true;
  } catch (error) {
    console.error(`[Resolve] Error resolving ${marketId}:`, error);
    return false;
  }
}

/**
 * Main function to resolve all markets for a session
 */
async function resolveSession(sessionId: string) {
  if (!ADMIN_KEY) {
    console.error(
      "Error: BASE_DAILY_ADMIN_KEY, ADMIN_API_KEY, or API_ADMIN_KEY must be set"
    );
    process.exit(1);
  }

  if (!ALCHEMY_API_KEY) {
    console.error("Error: ALCHEMY_API_KEY must be set");
    process.exit(1);
  }

  console.log(`[Resolve] Starting resolution for session ${sessionId}`);

  // Parse session date
  const sessionDate = new Date(`${sessionId}T00:00:00Z`);
  const sessionStart = new Date(sessionDate);
  sessionStart.setUTCHours(0, 10, 0, 0); // 10 minutes after midnight (open time)
  
  const sessionEnd = new Date(sessionDate);
  sessionEnd.setUTCDate(sessionEnd.getUTCDate() + 1); // End of day

  // Fetch Base blockchain data
  const baseData = await fetchBaseData(sessionStart, sessionEnd);

  // Resolve each market
  const results = await Promise.all(
    marketResolvers.map(async (resolver) => {
      const outcome = await resolver.resolve(baseData);
      
      if (outcome === null) {
        console.warn(
          `[Resolve] ⚠ Cannot determine outcome for ${resolver.marketId} - skipping`
        );
        return { marketId: resolver.marketId, success: false, skipped: true };
      }

      const success = await resolveMarket(
        sessionId,
        resolver.marketId,
        outcome
      );
      return { marketId: resolver.marketId, success, skipped: false };
    })
  );

  const successful = results.filter((r) => r.success).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.success && !r.skipped).length;

  console.log(`[Resolve] Complete: ${successful} resolved, ${skipped} skipped, ${failed} failed`);
}

// Main execution
const args = process.argv.slice(2);
const sessionId = args[0] || new Date().toISOString().split("T")[0]; // Default to today

resolveSession(sessionId).catch((error) => {
  console.error("[Resolve] Fatal error:", error);
  process.exit(1);
});


