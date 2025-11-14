/**
 * Check what market data is stored in predictions table
 */

import dotenv from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPredictions() {
  console.log("🔍 Checking predictions in database...\n");

  try {
    // Get all predictions with market info
    const { data: predictions, error } = await supabase
      .from("predictions")
      .select("id, market_id, market_ticker, market_title, settled, settled_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("❌ Error fetching predictions:", error);
      process.exit(1);
    }

    if (!predictions || predictions.length === 0) {
      console.log("📭 No predictions found in database");
      return;
    }

    console.log(`📊 Found ${predictions.length} predictions:\n`);

    predictions.forEach((pred, index) => {
      console.log(`${index + 1}. Prediction ID: ${pred.id}`);
      console.log(`   Market ID (hashed): ${pred.market_id}`);
      console.log(`   Market Ticker: ${pred.market_ticker || "❌ NULL"}`);
      console.log(`   Market Title: ${pred.market_title || "❌ NULL"}`);
      console.log(`   Settled: ${pred.settled ? "✅ Yes" : "❌ No"}`);
      console.log(`   Settled At: ${pred.settled_at || "N/A"}`);
      console.log(`   Created At: ${pred.created_at}`);
      console.log("");
    });

    // Check for predictions with missing tickers
    const missingTickers = predictions.filter(p => !p.market_ticker);
    if (missingTickers.length > 0) {
      console.log(`⚠️  Warning: ${missingTickers.length} predictions have NULL market_ticker`);
    }

    // Check for unique market tickers
    const uniqueTickers = new Set(predictions.filter(p => p.market_ticker).map(p => p.market_ticker));
    console.log(`\n📈 Unique market tickers: ${uniqueTickers.size}`);
    if (uniqueTickers.size > 0) {
      console.log("   Tickers:", Array.from(uniqueTickers).join(", "));
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkPredictions();

