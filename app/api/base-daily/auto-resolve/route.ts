// app/api/base-daily/auto-resolve/route.ts
"use server";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import {
  BASE_DAILY_MARKETS,
  computeBaseDailySession,
  previousSessionId,
  isValidSessionId,
  parseSessionId,
} from "@/lib/baseDaily";
import { fetchBaseMetricsForDate, AlchemyProvider } from "../providers";

const ADMIN_KEY =
  process.env.BASE_DAILY_ADMIN_KEY ||
  process.env.ADMIN_API_KEY ||
  process.env.API_ADMIN_KEY ||
  "";

interface BaseMetrics {
  activeAddresses: number;
  totalTransactions: number;
  avgGasPrice: number; // gwei
  newContracts: number;
  blockCount: number;
  erc20Transfers: number;
  txPerBlock: number;
  uniqueContractInteractions: number;
}

function determineOutcome(
  marketId: string,
  metricsMap: Record<string, number | null>
): boolean | null {
  const value = metricsMap[marketId];
  if (value == null) return null;

  switch (marketId) {
    case "active-addresses":
      return value >= 50_000;

    case "total-transactions":
      return value > 2_000_000;

    case "avg-gas-price":
      return value <= 0.2;

    case "new-contracts":
      return value >= 200;

    case "block-count":
      return value > 43_000;

    case "erc20-transfers":
      return value > 1_000_000;

    case "tx-per-block":
      return value > 50;

    case "unique-contract-interactions":
      return value >= 10_000;

    default:
      return null;
  }
}

async function resolveMarket(
  sessionId: string,
  marketId: string,
  outcome: boolean
): Promise<{ success: boolean; awardedCount?: number; error?: string }> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: "supabase_not_configured" };
    }

    const outcomeYes = outcome;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("base_daily_outcomes")
      .select("*")
      .eq("session_id", sessionId)
      .eq("market_id", marketId)
      .maybeSingle();

    if (existingError) {
      console.error("[auto-resolve] fetch existing outcome failed", existingError);
      return { success: false, error: `fetch_failed: ${existingError.message}` };
    }

    if (existing?.awarded && existing.outcome_yes !== outcomeYes) {
      return { success: false, error: "outcome_locked" };
    }

    const resolvedAt = new Date().toISOString();

    const upsertData = {
      session_id: sessionId,
      market_id: marketId,
      outcome_yes: outcomeYes,
      resolved_at: resolvedAt,
      awarded: existing?.awarded ?? false,
      awarded_at: existing?.awarded_at ?? null,
    };

    const { error: upsertError } = await supabaseAdmin
      .from("base_daily_outcomes")
      .upsert([upsertData], { onConflict: "session_id,market_id" });

    if (upsertError) {
      console.error("[auto-resolve] upsert outcome failed", upsertError);
      return { success: false, error: `upsert_failed: ${upsertError.message}` };
    }

    const { data: awardResult, error: awardError } = await supabaseAdmin.rpc(
      "award_base_daily_market",
      { p_session: sessionId, p_market: marketId }
    );

    if (awardError) {
      console.error("[auto-resolve] award rpc failed", awardError);
      return { success: false, error: `award_failed: ${awardError.message}` };
    }

    if (
      !awardResult ||
      typeof awardResult !== "object" ||
      ("ok" in (awardResult as Record<string, unknown>) &&
        (awardResult as Record<string, unknown>).ok !== true)
    ) {
      console.error(
        "[auto-resolve] award rpc returned unexpected payload",
        awardResult
      );
      return { success: false, error: "award_invalid_response" };
    }

    const awardedCount =
      "awarded_count" in (awardResult as Record<string, unknown>)
        ? Number((awardResult as Record<string, unknown>).awarded_count) || 0
        : 0;

    const { data: allOutcomes } = await supabaseAdmin
      .from("base_daily_outcomes")
      .select("market_id, awarded")
      .eq("session_id", sessionId);

    if (allOutcomes) {
      const totalMarkets = BASE_DAILY_MARKETS.length;
      const awardedMarkets = allOutcomes.filter((row) => row.awarded).length;
      const complete =
        allOutcomes.length === totalMarkets &&
        awardedMarkets === totalMarkets;

      if (complete) {
        const { error: settleUpdateError } = await supabaseAdmin
          .from("base_daily_sessions")
          .update({ phase: "settled" })
          .eq("session_id", sessionId);

        if (settleUpdateError) {
          console.error(
            "[auto-resolve] session settle update failed",
            settleUpdateError
          );
        }
      } else {
        const { data: sessionRow } = await supabaseAdmin
          .from("base_daily_sessions")
          .select("phase")
          .eq("session_id", sessionId)
          .maybeSingle();

        if (sessionRow?.phase === "open") {
          const { error: lockUpdateError } = await supabaseAdmin
            .from("base_daily_sessions")
            .update({ phase: "locked" })
            .eq("session_id", sessionId);

          if (lockUpdateError) {
            console.error(
              "[auto-resolve] session lock update failed",
              lockUpdateError
            );
          }
        }
      }
    }

    return { success: true, awardedCount };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handleAutoResolve(
  req: NextRequest,
  sessionIdFromBody?: string
) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 }
    );
  }

  const adminKey = req.headers.get("x-admin-key");
  const authHeader = req.headers.get("authorization") || "";
  const authValue = authHeader.replace(/^Bearer\s+/i, "");
  const expectedCronSecret = process.env.CRON_SECRET || "";

  const cronSecretFromAuth =
    expectedCronSecret && authValue === expectedCronSecret ? authValue : null;
  const adminKeyFromAuth =
    ADMIN_KEY && authValue === ADMIN_KEY ? authValue : null;

  const cronSecret = req.headers.get("x-cron-secret") || cronSecretFromAuth;
  const finalAdminKey = adminKey || adminKeyFromAuth;

  const userAgent = req.headers.get("user-agent") || "";
  const isVercelCron =
    userAgent.includes("vercel-cron") ||
    req.headers.get("x-vercel-cron") === "1";

  const isAuthorized =
    (ADMIN_KEY && finalAdminKey === ADMIN_KEY) ||
    (expectedCronSecret && cronSecret === expectedCronSecret) ||
    isVercelCron;

  if (!isAuthorized) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    let sessionId = sessionIdFromBody || "";
    const session = computeBaseDailySession();

    if (!sessionId || !isValidSessionId(sessionId)) {
      sessionId = previousSessionId(session.sessionId);
    }

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_session" },
        { status: 400 }
      );
    }

    const { data: existingOutcomes } = await supabaseAdmin
      .from("base_daily_outcomes")
      .select("market_id, awarded")
      .eq("session_id", sessionId);

    const resolvedMarkets = new Set(
      (existingOutcomes || []).map((o) => o.market_id)
    );
    const awardedMarkets = new Set(
      (existingOutcomes || [])
        .filter((o) => o.awarded)
        .map((o) => o.market_id)
    );

    if (
      resolvedMarkets.size >= BASE_DAILY_MARKETS.length &&
      awardedMarkets.size >= BASE_DAILY_MARKETS.length
    ) {
      console.log(
        `[auto-resolve] Session ${sessionId} already fully resolved and awarded`
      );
      return NextResponse.json({
        ok: true,
        sessionId,
        skipped: true,
        reason: "already_resolved_and_awarded",
        resolvedMarkets: resolvedMarkets.size,
        awardedMarkets: awardedMarkets.size,
        totalMarkets: BASE_DAILY_MARKETS.length,
      });
    }

    const sessionDate = parseSessionId(sessionId);
    if (!sessionDate) {
      return NextResponse.json(
        { ok: false, error: "invalid_session_date" },
        { status: 400 }
      );
    }

    const yyyy = String(sessionDate.getUTCFullYear());
    const mm = String(sessionDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(sessionDate.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    console.log(
      `[auto-resolve] Starting auto-resolution for session ${sessionId} (date: ${dateStr})`
    );

    // Get or save block numbers for this date
    const date = new Date(`${dateStr}T00:00:00Z`);
    const startTimestamp = Math.floor(date.getTime() / 1000);
    const endTimestamp = startTimestamp + 86400;

    // Check if we already have saved block numbers for this session
    const { data: sessionData } = await supabaseAdmin
      .from("base_daily_sessions")
      .select("start_block, end_block")
      .eq("session_id", sessionId)
      .maybeSingle();

    let startBlock: number | null = sessionData?.start_block ?? null;
    let endBlock: number | null = sessionData?.end_block ?? null;

    // If we don't have saved blocks, get them and save them
    if (!startBlock || !endBlock) {
      const apiKey = process.env.ALCHEMY_API_KEY;
      if (apiKey) {
        try {
          const alchemy = new AlchemyProvider(apiKey);
          const blockRangeResult = await alchemy.getBlockRangeForDate(
            startTimestamp,
            endTimestamp
          );

          if (blockRangeResult.success && blockRangeResult.data) {
            startBlock = blockRangeResult.data.startBlock;
            endBlock = blockRangeResult.data.endBlock;
            
            // Save blocks to session
            await supabaseAdmin
              .from("base_daily_sessions")
              .upsert({
                session_id: sessionId,
                start_block: startBlock,
                end_block: endBlock,
                phase: "settled", // Will be updated later if needed
                open_at: new Date(startTimestamp * 1000).toISOString(),
                lock_at: new Date(endTimestamp * 1000).toISOString(),
                resolve_at: new Date(endTimestamp * 1000).toISOString(),
                metrics: {},
              }, {
                onConflict: "session_id",
              });

            console.log(
              `[auto-resolve] Saved block range for ${dateStr}: ${startBlock} - ${endBlock}`
            );
          }
        } catch (error) {
          console.warn(
            `[auto-resolve] Failed to get/save block range:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } else {
      console.log(
        `[auto-resolve] Using saved block range for ${dateStr}: ${startBlock} - ${endBlock}`
      );
    }

    const { metrics: metricsMap, sources, errors } =
      await fetchBaseMetricsForDate(dateStr, startBlock, endBlock);

    console.log("[auto-resolve] Metrics sources:", sources);
    
    // Log successful metrics with their values
    const successfulMetrics: Record<string, number> = {};
    Object.entries(metricsMap).forEach(([marketId, value]) => {
      if (value !== null && value !== undefined) {
        successfulMetrics[marketId] = value;
      }
    });
    if (Object.keys(successfulMetrics).length > 0) {
      console.log("[auto-resolve] Metrics values:", successfulMetrics);
    }
    
    if (Object.keys(errors).length > 0) {
      console.warn("[auto-resolve] Metrics errors:", errors);
    }

    const metrics: BaseMetrics = {
      activeAddresses: metricsMap["active-addresses"] ?? 0,
      totalTransactions: metricsMap["total-transactions"] ?? 0,
      avgGasPrice: metricsMap["avg-gas-price"] ?? 0.2,
      newContracts: metricsMap["new-contracts"] ?? 0,
      blockCount: metricsMap["block-count"] ?? 0,
      erc20Transfers: metricsMap["erc20-transfers"] ?? 0,
      txPerBlock: metricsMap["tx-per-block"] ?? 0,
      uniqueContractInteractions: metricsMap["unique-contract-interactions"] ?? 0,
    };

    type MarketResolutionResult =
      | {
          marketId: string;
          skipped: true;
          reason: string;
          error?: string;
        }
      | {
          marketId: string;
          outcome: "yes" | "no";
          success: boolean;
          awardedCount?: number;
          error?: string;
        };

    const results = await Promise.all(
      BASE_DAILY_MARKETS.map(async (market): Promise<MarketResolutionResult> => {
        if (resolvedMarkets.has(market.id) && awardedMarkets.has(market.id)) {
          return {
            marketId: market.id,
            skipped: true,
            reason: "already_resolved_and_awarded",
          };
        }

        const outcome = determineOutcome(market.id, metricsMap);

        if (outcome === null) {
          const errorMsg =
            errors[market.id] || "No data source or value for this market";
          console.log(
            `[auto-resolve] Cannot determine outcome for ${market.id}: ${errorMsg}`
          );
          return {
            marketId: market.id,
            skipped: true,
            reason: "cannot_determine",
            error: errorMsg,
          };
        }

        const result = await resolveMarket(sessionId, market.id, outcome);

        return {
          marketId: market.id,
          outcome: outcome ? "yes" : "no",
          success: result.success,
          awardedCount: result.awardedCount,
          error: result.error,
        };
      })
    );

    const successful = results.filter((r): r is Extract<MarketResolutionResult, { success: boolean }> => 
      "success" in r && r.success
    ).length;
    const skipped = results.filter((r): r is Extract<MarketResolutionResult, { skipped: true }> => 
      "skipped" in r && r.skipped
    ).length;
    const failed = results.filter(
      (r): r is Extract<MarketResolutionResult, { success: boolean }> => 
        "success" in r && !r.success && !("skipped" in r)
    ).length;

    return NextResponse.json({
      ok: true,
      sessionId,
      metrics,
      results,
      summary: {
        successful,
        skipped,
        failed,
        total: BASE_DAILY_MARKETS.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auto-resolve] Error:", message);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleAutoResolve(req);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId =
    typeof body?.sessionId === "string" ? body.sessionId : undefined;
  return handleAutoResolve(req, sessionId);
}
