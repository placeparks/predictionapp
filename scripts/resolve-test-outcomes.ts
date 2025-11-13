/**
 * Script to manually resolve outcomes for a test session
 * Usage: npx tsx scripts/resolve-test-outcomes.ts <sessionId> <marketId> <outcome>
 * Example: npx tsx scripts/resolve-test-outcomes.ts "2025-11-11-16:20" "avg-gas-price" "yes"
 * 
 * Or set outcomes for all markets in a session:
 * npx tsx scripts/resolve-test-outcomes.ts "2025-11-11-16:20"
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ADMIN_KEY = process.env.BASE_DAILY_ADMIN_KEY || process.env.ADMIN_API_KEY || "";

const MARKETS = [
  "active-addresses",
  "total-transactions",
  "avg-gas-price",
  "dex-volume",
  "net-bridge",
  "new-contracts",
  "nft-mints",
  "average-confirmation",
  "tvl-growth",
  "gas-savings",
];

async function resolveMarket(sessionId: string, marketId: string, outcome: "yes" | "no") {
  const response = await fetch(`${BASE_URL}/api/base-daily/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_KEY,
    },
    body: JSON.stringify({
      sessionId,
      marketId,
      outcome,
      sources: ["manual_test"],
    }),
  });

  const data = await response.json();
  return { success: response.ok, data };
}

async function main() {
  const args = process.argv.slice(2);
  const sessionId = args[0];

  if (!sessionId) {
    console.error("Usage: npx tsx scripts/resolve-test-outcomes.ts <sessionId> [marketId] [outcome]");
    console.error('Example: npx tsx scripts/resolve-test-outcomes.ts "2025-11-11-16:20" "avg-gas-price" "yes"');
    process.exit(1);
  }

  if (!ADMIN_KEY) {
    console.error("Error: BASE_DAILY_ADMIN_KEY or ADMIN_API_KEY environment variable not set");
    process.exit(1);
  }

  // If marketId and outcome are provided, resolve just that market
  if (args[1] && args[2]) {
    const marketId = args[1];
    const outcome = args[2].toLowerCase() as "yes" | "no";

    if (outcome !== "yes" && outcome !== "no") {
      console.error('Error: outcome must be "yes" or "no"');
      process.exit(1);
    }

    console.log(`Resolving ${marketId} for session ${sessionId} as ${outcome}...`);
    const result = await resolveMarket(sessionId, marketId, outcome);

    if (result.success) {
      console.log("✅ Success:", result.data);
    } else {
      console.error("❌ Error:", result.data);
      process.exit(1);
    }
    return;
  }

  // Otherwise, resolve all markets with default test outcomes
  console.log(`Resolving all markets for session ${sessionId}...`);
  console.log("Using default test outcomes (you can modify these in the script)\n");

  const defaultOutcomes: Record<string, "yes" | "no"> = {
    "active-addresses": "yes",
    "total-transactions": "yes",
    "avg-gas-price": "yes",
    "dex-volume": "no",
    "net-bridge": "yes",
    "new-contracts": "yes",
    "nft-mints": "no",
    "average-confirmation": "yes",
    "tvl-growth": "yes",
    "gas-savings": "yes",
  };

  const results = await Promise.all(
    MARKETS.map(async (marketId) => {
      const outcome = defaultOutcomes[marketId] || "yes";
      const result = await resolveMarket(sessionId, marketId, outcome);
      return { marketId, outcome, ...result };
    })
  );

  console.log("\nResults:");
  results.forEach(({ marketId, outcome, success, data }) => {
    if (success) {
      console.log(`✅ ${marketId}: ${outcome} - ${JSON.stringify(data)}`);
    } else {
      console.error(`❌ ${marketId}: ${outcome} - ${JSON.stringify(data)}`);
    }
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  console.log(`\nSummary: ${successCount} succeeded, ${failCount} failed`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

