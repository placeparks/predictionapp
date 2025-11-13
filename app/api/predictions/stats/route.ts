import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { keccak256, stringToBytes } from "viem";

/**
 * GET /api/predictions/stats?markets=market1,market2,market3
 * Returns total points staked on YES and NO for each market
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    const url = new URL(req.url);
    const marketsParam = url.searchParams.get("markets");
    
    if (!marketsParam) {
      return NextResponse.json({ ok: false, error: "markets_required", message: "markets query parameter is required" }, { status: 400 });
    }

    const marketTickers = marketsParam.split(",").map(m => m.trim()).filter(Boolean);
    
    if (marketTickers.length === 0) {
      return NextResponse.json({ ok: false, error: "invalid_markets", message: "No valid market tickers provided" }, { status: 400 });
    }

    // Convert market tickers to market_ids (keccak256 hashes)
    const marketIds = marketTickers.map(ticker => keccak256(stringToBytes(ticker)));

    // Query predictions grouped by market_id and side_yes
    const { data: predictions, error: predError } = await supabaseAdmin
      .from("predictions")
      .select("market_id, side_yes, stake_points")
      .in("market_id", marketIds);

    if (predError) {
      console.error("Error fetching prediction stats:", predError);
      return NextResponse.json({ ok: false, error: "fetch_failed", message: predError.message }, { status: 500 });
    }

    // Aggregate stats by market_id
    const stats: Record<string, { yes: number; no: number }> = {};
    
    // Initialize all markets with 0 stats
    marketIds.forEach(marketId => {
      stats[marketId] = { yes: 0, no: 0 };
    });

    // Sum up points by side
    if (predictions) {
      for (const pred of predictions) {
        const marketId = pred.market_id;
        const stake = Number(pred.stake_points) || 0;
        
        if (stats[marketId]) {
          if (pred.side_yes) {
            stats[marketId].yes += stake;
          } else {
            stats[marketId].no += stake;
          }
        }
      }
    }

    // Map back to tickers for easier frontend consumption
    const result: Record<string, { yes: number; no: number; total: number }> = {};
    marketTickers.forEach((ticker, index) => {
      const marketId = marketIds[index];
      const stat = stats[marketId] || { yes: 0, no: 0 };
      result[ticker] = {
        yes: stat.yes,
        no: stat.no,
        total: stat.yes + stat.no,
      };
    });

    return NextResponse.json({
      ok: true,
      stats: result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Prediction stats error:", msg);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}
