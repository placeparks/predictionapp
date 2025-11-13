/**
 * Watcher script that periodically checks Kalshi for resolved markets
 * 
 * This script runs continuously, checking for resolved markets at regular intervals.
 * Similar to auto-resolve-watcher but for Kalshi market resolutions.
 * 
 * Usage:
 *   npm run check-resolutions:watch
 *   or
 *   tsx scripts/check-kalshi-resolutions-watcher.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes (adjust as needed)

async function checkAndSettle() {
  try {
    console.log(`[${new Date().toISOString()}] 🔍 Checking for resolved Kalshi markets...`);

    const response = await fetch(`${BASE_URL}/api/settle/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`[${new Date().toISOString()}] ❌ Error:`, error.error || error.message || `HTTP ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!data.ok) {
      console.error(`[${new Date().toISOString()}] ❌ Error:`, data.error || data.message);
      return;
    }

    const { summary, details } = data;

    if (summary.settled > 0 || summary.errors > 0) {
      console.log(`[${new Date().toISOString()}] ✅ Check complete:`);
      console.log(`   - Checked: ${summary.checked} markets`);
      console.log(`   - Settled: ${summary.settled} markets`);
      console.log(`   - Skipped: ${summary.skipped} markets (not yet resolved)`);
      console.log(`   - Errors: ${summary.errors} markets`);

      if (summary.settled > 0) {
        console.log(`\n📊 Settled markets:`);
        details
          .filter((d: any) => d.status === "settled" || d.status === "settled_from_cache")
          .forEach((d: any) => {
            console.log(`   ✅ ${d.ticker}: ${d.outcome ? "YES" : "NO"} won`);
          });
      }

      if (summary.errors > 0) {
        console.log(`\n⚠️  Errors encountered:`);
        details
          .filter((d: any) => d.error)
          .forEach((d: any) => {
            console.log(`   ❌ ${d.ticker}: ${d.error}`);
          });
      }
    } else if (summary.checked > 0) {
      // Only log if there are markets to check (avoid spam when no predictions)
      console.log(`[${new Date().toISOString()}] ⏭️  No resolved markets found (${summary.checked} checked, ${summary.skipped} still open)`);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Fatal error:`, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] 🚀 Starting Kalshi resolution watcher...`);
  console.log(`   - Check interval: ${CHECK_INTERVAL_MS / 1000} seconds`);
  console.log(`   - Base URL: ${BASE_URL}`);
  console.log(`   - Press Ctrl+C to stop\n`);

  // Run immediately on start
  await checkAndSettle();

  // Then run on interval
  const intervalId = setInterval(checkAndSettle, CHECK_INTERVAL_MS);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n[${new Date().toISOString()}] ⏹️  Stopping watcher...`);
    clearInterval(intervalId);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log(`\n[${new Date().toISOString()}] ⏹️  Stopping watcher...`);
    clearInterval(intervalId);
    process.exit(0);
  });
}

main();

