import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

interface Prediction {
  id: number;
  market_id: string;
  user_address: string;
  period_id: number;
  side_yes: boolean;
  stake_points: number;
  settled: boolean;
  settled_at: string | null;
  won: boolean | null;
  [key: string]: unknown;
}

interface WinningRecord {
  user: string;
  amount: number;
}

/**
 * Settlement API - Settles predictions when Kalshi markets resolve
 * 
 * This allows cross-period settlements:
 * - Periods can close after 30 days
 * - Predictions can still be settled later when markets resolve
 * - Distributions reference the original period_id
 */
export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    const body = await req.json();
    const { market_id, outcome_yes, source } = body as {
      market_id: string;
      outcome_yes: boolean; // true if YES won, false if NO won
      source?: string; // Optional source of settlement (e.g., "auto_settlement", "manual_settlement")
    };

    if (!market_id) {
      return NextResponse.json({ ok: false, error: "invalid_payload", message: "market_id is required" }, { status: 400 });
    }

    // Find all unsettled predictions for this market
    const { data: predictions, error: predError } = await supabaseAdmin
      .from("predictions")
      .select("*")
      .eq("market_id", market_id)
      .eq("settled", false)
      .is("settled_at", null);

    if (predError) {
      console.error("Error fetching predictions:", predError);
      return NextResponse.json({ ok: false, error: "fetch_predictions_failed", message: predError.message }, { status: 500 });
    }

    if (!predictions || predictions.length === 0) {
      return NextResponse.json({ ok: false, error: "no_predictions", message: "No unsettled predictions found for this market" }, { status: 404 });
    }

    // Mark predictions as settled
    const winningPredictions = predictions.filter((p: Prediction) => p.side_yes === outcome_yes);
    const losingPredictions = predictions.filter((p: Prediction) => p.side_yes !== outcome_yes);
    const settledAt = new Date().toISOString();

    // Update each prediction individually to set won correctly
    for (const pred of predictions) {
      const won = pred.side_yes === outcome_yes;
      const { error: updateError } = await supabaseAdmin
        .from("predictions")
        .update({ 
          settled: true, 
          settled_at: settledAt,
          won: won
        })
        .eq("id", pred.id);
      
      if (updateError) {
        console.error(`Error updating prediction ${pred.id}:`, updateError);
        // Continue with other predictions even if one fails
      }
    }

    // Group winning predictions by period_id for distributions
    const periodWinnings: Record<number, WinningRecord[]> = {};
    
    for (const pred of winningPredictions) {
      const periodId = Number(pred.period_id);
      if (!periodWinnings[periodId]) {
        periodWinnings[periodId] = [];
      }
      
      const user = pred.user_address.toLowerCase();
      const existing = periodWinnings[periodId].find((w: WinningRecord) => w.user === user);
      
      if (existing) {
        existing.amount += Number(pred.stake_points);
      } else {
        periodWinnings[periodId].push({
          user,
          amount: Number(pred.stake_points)
        });
      }
    }

    // Create distribution records (one per user per period)
    const distributions = [];
    for (const [periodId, winnings] of Object.entries(periodWinnings)) {
      for (const { user, amount } of winnings) {
        distributions.push({
          period_id: Number(periodId),
          user_address: user,
          amount_usdc: amount, // TODO: Calculate actual USDC amount based on odds/payout
          tx_hash: null, // Will be set when on-chain distribution happens
        });
      }
    }

    if (distributions.length > 0) {
      const { error: distError } = await supabaseAdmin
        .from("distributions")
        .insert(distributions);

      if (distError) {
        console.error("Error creating distributions:", distError);
        // Don't fail the settlement if distribution creation fails
      }
    }

    // Update or create outcome record
    await supabaseAdmin
      .from("outcomes")
      .upsert({
        market_id,
        resolved: true,
        side_yes: outcome_yes,
        settlement_ts: new Date().toISOString(),
        source: source || "manual_settlement",
        raw: { market_id, outcome_yes, settled_at: new Date().toISOString(), source: source || "manual_settlement" }
      }, {
        onConflict: "market_id"
      });

    return NextResponse.json({
      ok: true,
      settled: {
        market_id,
        outcome_yes,
        total_predictions: predictions.length,
        winners: winningPredictions.length,
        losers: losingPredictions.length,
        distributions_created: distributions.length,
        periods_affected: Object.keys(periodWinnings).length
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Settlement error:", msg);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}

