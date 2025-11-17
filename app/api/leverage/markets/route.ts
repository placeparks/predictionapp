"use server";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

interface MarketAgg {
  market_id: string;
  market_ticker: string | null;
  market_title: string | null;
  yes_stake: number;
  no_stake: number;
  yes_weight: number;
  no_weight: number;
}

export async function GET(_req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { ok: false, error: "supabase_not_configured" },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leverage_positions")
      .select(
        "market_id, market_ticker, market_title, side_yes, stake_amount, weight"
      )
      .eq("settled", false);

    if (error) {
      console.error("[leverage][markets] query failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_query_failed", message: error.message },
        { status: 500 }
      );
    }

    const aggregates = new Map<string, MarketAgg>();
    (data || []).forEach((row) => {
      const key = row.market_id;
      if (!aggregates.has(key)) {
        aggregates.set(key, {
          market_id: row.market_id,
          market_ticker: row.market_ticker || "",
          market_title: row.market_title || "",
          yes_stake: 0,
          no_stake: 0,
          yes_weight: 0,
          no_weight: 0,
        });
      }
      const entry = aggregates.get(key)!;
      const stake = Number(row.stake_amount) || 0;
      const weight = Number(row.weight) || stake;
      if (row.side_yes) {
        entry.yes_stake += stake;
        entry.yes_weight += weight;
      } else {
        entry.no_stake += stake;
        entry.no_weight += weight;
      }
    });

    const marketIds = Array.from(aggregates.keys());
    if (marketIds.length > 0) {
      const { data: metadata } = await supabaseAdmin
        .from("markets")
        .select("market_id, title, ticker")
        .in("market_id", marketIds);
      metadata?.forEach((meta) => {
        const entry = aggregates.get(meta.market_id);
        if (!entry) return;
        if ((!entry.market_title || entry.market_title.trim() === "") && meta.title) {
          entry.market_title = meta.title;
        }
        if ((!entry.market_ticker || entry.market_ticker.trim() === "") && meta.ticker) {
          entry.market_ticker = meta.ticker;
        }
      });
    }

    const markets = Array.from(aggregates.values()).sort(
      (a, b) =>
        b.yes_stake +
        b.no_stake -
        (a.yes_stake + a.no_stake)
    );

    return NextResponse.json({ ok: true, markets });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[leverage][markets] unexpected error:", msg);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: msg },
      { status: 500 }
    );
  }
}
