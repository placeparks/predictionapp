/**
 * Script to check Kalshi for resolved markets and automatically settle predictions
 * 
 * This script can be run periodically (e.g., via cron) to check for newly resolved
 * Kalshi markets and settle any pending predictions.
 * 
 * Usage:
 *   npm run check-resolutions
 *   or
 *   tsx scripts/check-kalshi-resolutions.ts
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
      process.exit(1);
    }

    const data = await response.json();

    if (!data.ok) {
      console.error(`[${new Date().toISOString()}] ❌ Error:`, data.error || data.message);
      process.exit(1);
    }

    const { summary, details } = data;

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

    // Exit with error code if there were errors
    if (summary.errors > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Fatal error:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the check
checkAndSettle();

