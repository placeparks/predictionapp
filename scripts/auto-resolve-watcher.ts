/**
 * Local development watcher that automatically resolves closed sessions
 * This simulates the cron job behavior for local development
 * 
 * Usage: npx tsx scripts/auto-resolve-watcher.ts
 * 
 * This will check every 30 seconds for closed sessions and resolve them automatically
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ADMIN_KEY = process.env.BASE_DAILY_ADMIN_KEY || process.env.ADMIN_API_KEY || "";

const CHECK_INTERVAL_MS = 30_000; // Check every 30 seconds

async function checkAndResolve() {
  try {
    const response = await fetch(`${BASE_URL}/api/base-daily/auto-resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY,
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      if (data.skipped) {
        console.log(`[${new Date().toISOString()}] ⏭️  Skipped: ${data.reason} (${data.resolvedMarkets}/${data.totalMarkets} markets)`);
      } else {
        console.log(`[${new Date().toISOString()}] ✅ Resolved session ${data.sessionId}:`);
        console.log(`   - Successful: ${data.summary?.successful || 0}`);
        console.log(`   - Skipped: ${data.summary?.skipped || 0}`);
        console.log(`   - Failed: ${data.summary?.failed || 0}`);
        if (data.results) {
          data.results.forEach((r: any) => {
            if (r.success) {
              console.log(`   ✅ ${r.marketId}: ${r.outcome} (awarded: ${r.awardedCount || 0})`);
            } else if (r.skipped) {
              console.log(`   ⏭️  ${r.marketId}: ${r.reason}`);
            } else {
              console.log(`   ❌ ${r.marketId}: ${r.error}`);
            }
          });
        }
      }
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Error:`, data.error || data.message || "Unknown error");
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Fatal error:`, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  if (!ADMIN_KEY) {
    console.error("Error: BASE_DAILY_ADMIN_KEY or ADMIN_API_KEY environment variable not set");
    process.exit(1);
  }

  console.log("🚀 Auto-resolve watcher started");
  console.log(`   - Checking every ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log(`   - Base URL: ${BASE_URL}`);
  console.log(`   - Press Ctrl+C to stop\n`);

  // Run immediately on start
  await checkAndResolve();

  // Then run on interval
  const intervalId = setInterval(checkAndResolve, CHECK_INTERVAL_MS);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping auto-resolve watcher...');
    clearInterval(intervalId);
    process.exit(0);
  });

  // Keep the process alive
  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Stopping auto-resolve watcher...');
    clearInterval(intervalId);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

