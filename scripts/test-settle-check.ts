/**
 * Test script for /api/settle/check endpoint
 * Tests the Kalshi auto-settlement checker using public API
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET || "";

async function testSettleCheck() {
  console.log("🧪 Testing /api/settle/check endpoint...\n");

  try {
    const url = `${BASE_URL}/api/settle/check`;
    console.log(`📍 URL: ${url}`);
    console.log(`🔑 Using CRON_SECRET: ${CRON_SECRET ? "✅ Set" : "❌ Not set (will use dev mode)"}\n`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add authorization if CRON_SECRET is set
    if (CRON_SECRET) {
      headers["Authorization"] = `Bearer ${CRON_SECRET}`;
    }

    console.log("📤 Sending GET request...");
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    const duration = Date.now() - startTime;

    console.log(`\n📥 Response Status: ${response.status} ${response.statusText}`);
    console.log(`⏱️  Duration: ${duration}ms\n`);

    const data = await response.json().catch(async (e) => {
      const text = await response.text();
      console.error("❌ Failed to parse JSON response:", e);
      console.error("Raw response:", text);
      return { error: "parse_error", raw: text };
    });

    if (!response.ok) {
      console.error("❌ Request failed!");
      console.error("Error:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log("✅ Request successful!\n");
    console.log("📊 Results:");
    console.log(JSON.stringify(data, null, 2));

    if (data.ok) {
      const summary = data.summary || {};
      console.log("\n📈 Summary:");
      console.log(`   - Checked: ${summary.checked || 0} markets`);
      console.log(`   - Settled: ${summary.settled || 0} markets`);
      console.log(`   - Skipped: ${summary.skipped || 0} markets`);
      console.log(`   - Errors: ${summary.errors || 0} markets`);

      if (data.details && data.details.length > 0) {
        console.log("\n📋 Details:");
        data.details.forEach((detail: any, index: number) => {
          console.log(`   ${index + 1}. ${detail.ticker || detail.market_id}:`);
          console.log(`      Status: ${detail.status}`);
          if (detail.outcome !== undefined) {
            console.log(`      Outcome: ${detail.outcome ? "YES" : "NO"}`);
          }
          if (detail.error) {
            console.log(`      Error: ${detail.error}`);
          }
        });
      }
    }

    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testSettleCheck();

