"use server";

import { NextRequest, NextResponse } from "next/server";
import { keccak256, stringToBytes, isAddress } from "viem";
import { supabaseAdmin } from "@/lib/db";

const AMOUNT_SCALE = 1_000_000;
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const normalizeAmount = (value: number) =>
  Math.round(value * AMOUNT_SCALE) / AMOUNT_SCALE;

const MIN_LEVERAGE_STAKE = Number(
  process.env.MIN_LEVERAGE_STAKE || process.env.NEXT_PUBLIC_MIN_LEVERAGE_STAKE || "1"
);
const MAX_LEVERAGE_STAKE = Number(
  process.env.MAX_LEVERAGE_STAKE || process.env.NEXT_PUBLIC_MAX_LEVERAGE_STAKE || "5000"
);
const MAX_LEVERAGE = Math.max(
  1,
  Number(process.env.LEVERAGE_MAX_MULTIPLIER || process.env.NEXT_PUBLIC_MAX_LEVERAGE || "10")
);

const ensureSupabase = () => {
  if (!supabaseAdmin) {
    throw new Error("supabase_not_configured");
  }
};

export async function GET(req: NextRequest) {
  try {
    ensureSupabase();
    const url = new URL(req.url);
    const userRaw = url.searchParams.get("user") || "";
    let query = supabaseAdmin
      .from("leverage_positions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (userRaw) {
      if (!isAddress(userRaw)) {
        return NextResponse.json(
          { ok: false, error: "invalid_user", message: "Invalid wallet address" },
          { status: 400 }
        );
      }
      query = query.eq("user_address", userRaw.toLowerCase());
    }

    const { data, error } = await query;
    if (error) {
      console.error("[leverage][GET] query failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_query_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, positions: data || [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "supabase_not_configured") {
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
    console.error("[leverage][GET] unexpected error:", message);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  ensureSupabase();
  let stakeAmount = 0;
  let userAddress = "";

  const refundStake = async () => {
    if (!stakeAmount || !userAddress) return;
    try {
      await supabaseAdmin!.rpc("grant_points", {
        p_user: userAddress,
        p_amount: stakeAmount,
      });
    } catch (err) {
      console.warn("[leverage][POST] failed to refund stake:", err);
    }
  };

  try {
    const body = await req.json();
    const {
      user,
      marketTicker,
      marketTitle,
      sideYes,
      stakeAmount: rawStake,
      leverage: rawLeverage,
    } = body as {
      user: string;
      marketTicker: string;
      marketTitle?: string;
      sideYes: boolean;
      stakeAmount: number | string;
      leverage?: number | string;
    };

    if (!user || !marketTicker || rawStake === undefined || sideYes === undefined) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!isAddress(user)) {
      return NextResponse.json(
        { ok: false, error: "invalid_user", message: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const ticker = marketTicker.trim();
    if (!ticker) {
      return NextResponse.json(
        { ok: false, error: "invalid_ticker", message: "Market ticker is required" },
        { status: 400 }
      );
    }

    const parsedStake = Number(rawStake);
    if (!Number.isFinite(parsedStake) || parsedStake <= 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_stake", message: "stakeAmount must be positive" },
        { status: 400 }
      );
    }

    stakeAmount = normalizeAmount(
      clamp(parsedStake, MIN_LEVERAGE_STAKE, MAX_LEVERAGE_STAKE)
    );
    const leverageValueRaw = Number(rawLeverage ?? 1);
    const leverageValue = clamp(
      Number.isFinite(leverageValueRaw) && leverageValueRaw > 0
        ? Math.trunc(leverageValueRaw) || 1
        : 1,
      1,
      MAX_LEVERAGE
    );
    const weight = normalizeAmount(stakeAmount * leverageValue);

    userAddress = user.toLowerCase();
    const marketId = keccak256(stringToBytes(ticker));

    const spendResult = await supabaseAdmin!.rpc("spend_points", {
      p_user: userAddress,
      p_amount: stakeAmount,
    });

    if (spendResult.error) {
      console.error("[leverage][POST] spend_points failed:", spendResult.error);
      return NextResponse.json(
        {
          ok: false,
          error: "stake_debit_failed",
          message: spendResult.error.message || String(spendResult.error),
        },
        { status: 500 }
      );
    }

    if (!spendResult.data) {
      const { data: balanceData } = await supabaseAdmin!.rpc("get_points", {
        p_user: userAddress,
      });
      const balance = Number(balanceData) || 0;
      return NextResponse.json(
        {
          ok: false,
          error: "insufficient_funds",
          message: `You have ${balance.toFixed(
            2
          )} tokens available but tried to stake ${stakeAmount.toFixed(2)}.`,
        },
        { status: 402 }
      );
    }

    const insertPayload = {
      user_address: userAddress,
      market_id: marketId,
      market_ticker: ticker,
      market_title: marketTitle || ticker,
      side_yes: !!sideYes,
      stake_amount: stakeAmount,
      leverage: leverageValue,
      weight,
    };

    const { data, error } = await supabaseAdmin!
      .from("leverage_positions")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      await refundStake();
      console.error("[leverage][POST] insert failed:", error);
      return NextResponse.json(
        { ok: false, error: "db_insert_failed", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, position: data });
  } catch (e) {
    await refundStake();
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[leverage][POST] unexpected error:", msg);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: msg },
      { status: 500 }
    );
  }
}
