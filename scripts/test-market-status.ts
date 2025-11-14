/**
 * Test script to check market status on Kalshi
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function checkMarketStatus(ticker: string) {
  console.log(`🔍 Checking market: ${ticker}\n`);

  try {
    // Use the public API proxy
    const url = `${BASE_URL}/api/kalshi-public/markets/${ticker}`;
    console.log(`📍 URL: ${url}\n`);

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CardifyMiniApp/1.0'
      }
    });

    console.log(`📥 Response Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const text = await response.text();
      console.log(`❌ Market not found or error:`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response: ${text.substring(0, 200)}`);
      return;
    }

    const data = await response.json();
    const market = data.market || data;

    console.log(`✅ Market found!\n`);
    console.log(`📊 Market Details:`);
    console.log(`   Ticker: ${market.ticker || ticker}`);
    console.log(`   Title: ${market.title || market.question || "N/A"}`);
    console.log(`   Status: ${market.status || "N/A"}`);
    console.log(`   Yes Price: ${market.yes_price || market.yes_bid || "N/A"}`);
    console.log(`   No Price: ${market.no_price || market.no_bid || "N/A"}`);
    
    if (market.status === "settled") {
      console.log(`\n🎯 Market is SETTLED!`);
      if (market.yes_price === 100 || market.yes_bid === 100) {
        console.log(`   Outcome: YES won`);
      } else if (market.no_price === 100 || market.no_bid === 100) {
        console.log(`   Outcome: NO won`);
      } else if (market.outcome !== undefined) {
        console.log(`   Outcome: ${market.outcome}`);
      } else {
        console.log(`   Outcome: Could not determine from data`);
      }
    } else {
      console.log(`\n⏳ Market is ${market.status || "unknown"} - not yet settled`);
    }

    console.log(`\n📄 Full response (first 500 chars):`);
    console.log(JSON.stringify(data, null, 2).substring(0, 500));

  } catch (error) {
    console.error(`\n❌ Error checking market:`, error);
  }
}

// Check both markets
async function main() {
  console.log("=".repeat(60));
  console.log("Market Status Checker");
  console.log("=".repeat(60));
  console.log("");

  await checkMarketStatus("KXRATECUTCOUNT");
  console.log("\n" + "=".repeat(60) + "\n");
  await checkMarketStatus("KXPGATOUR");
}

main();

