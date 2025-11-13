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

type SessionRow = {
  session_id: string;
  phase: "open" | "locked" | "settled" | "break";
  open_at: string;
  lock_at: string;
  resolve_at: string;
  anchor_time: string | null;
  anchor_block: number | null;
  metrics: Record<string, unknown> | null;
};

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 }
    );
  }

  const adminKey =
    req.headers.get("x-admin-key") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

  const expectedKey =
    process.env.BASE_DAILY_ADMIN_KEY ||
    process.env.ADMIN_API_KEY ||
    process.env.API_ADMIN_KEY ||
    "";

  if (!expectedKey || adminKey !== expectedKey) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    let sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    const marketId = typeof body?.marketId === "string" ? body.marketId : "";
    const outcomeRaw = typeof body?.outcome === "string" ? body.outcome.toLowerCase() : "";
    const sourcesInput = Array.isArray(body?.sources) ? body.sources : [];

    if (!marketId) {
      return NextResponse.json(
        { ok: false, error: "invalid_market" },
        { status: 400 }
      );
    }

    if (outcomeRaw !== "yes" && outcomeRaw !== "no") {
      return NextResponse.json(
        { ok: false, error: "invalid_outcome" },
        { status: 400 }
      );
    }

    const market = BASE_DAILY_MARKETS.find((m) => m.id === marketId);
    if (!market) {
      return NextResponse.json(
        { ok: false, error: "unknown_market" },
        { status: 404 }
      );
    }

    const session = computeBaseDailySession();
    if (!sessionId || !isValidSessionId(sessionId)) {
      sessionId =
        session.phase === "break"
          ? previousSessionId(session.sessionId)
          : session.sessionId;
    }

    if (!isValidSessionId(sessionId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_session" },
        { status: 400 }
      );
    }

    const { data: sessionRowData, error: sessionRowError } = await supabaseAdmin
      .from("base_daily_sessions")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (sessionRowError) {
      console.error("[base-daily/resolve] fetch session failed", sessionRowError);
      return NextResponse.json(
        { ok: false, error: "session_fetch_failed" },
        { status: 500 }
      );
    }

    let sessionRow = sessionRowData as SessionRow | null;

    if (!sessionRow) {
      const parsed = parseSessionId(sessionId);
      const defaults = computeBaseDailySession(parsed ?? new Date());
      const { data: insertedRow, error: insertError } = await supabaseAdmin
        .from("base_daily_sessions")
        .insert({
          session_id: sessionId,
          phase: "locked",
          open_at: defaults.openAt.toISOString(),
          lock_at: defaults.lockAt.toISOString(),
          resolve_at: defaults.resolveAt.toISOString(),
          anchor_time: defaults.lockAt.toISOString(),
          metrics: {},
        })
        .select("*")
        .single();
      if (insertError) {
        console.error("[base-daily/resolve] failed to insert session row", insertError);
      } else {
        sessionRow = insertedRow as SessionRow;
      }
    }

    const outcomeYes = outcomeRaw === "yes";

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("base_daily_outcomes")
      .select("*")
      .eq("session_id", sessionId)
      .eq("market_id", marketId)
      .maybeSingle();

    if (existingError) {
      console.error("[base-daily/resolve] fetch existing failed", existingError);
      return NextResponse.json(
        { ok: false, error: "fetch_failed" },
        { status: 500 }
      );
    }

    if (existing?.awarded && existing.outcome_yes !== outcomeYes) {
      return NextResponse.json(
        {
          ok: false,
          error: "outcome_locked",
          message: "Outcome already awarded. Reverse not supported.",
        },
        { status: 409 }
      );
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

    console.log("[base-daily/resolve] upserting outcome", upsertData);

    const { error: upsertError } = await supabaseAdmin
      .from("base_daily_outcomes")
      .upsert([upsertData], { onConflict: "session_id,market_id" });

    if (upsertError) {
      console.error("[base-daily/resolve] upsert failed", upsertError);
      console.error("[base-daily/resolve] upsert data was", upsertData);
      return NextResponse.json(
        { ok: false, error: "upsert_failed", details: upsertError.message || String(upsertError) },
        { status: 500 }
      );
    }

    const { data: awardResult, error: awardError } = await supabaseAdmin.rpc(
      "award_base_daily_market",
      {
        p_session: sessionId,
        p_market: marketId,
      }
    );

    if (awardError) {
      console.error("[base-daily/resolve] award rpc failed", awardError);
      console.error("[base-daily/resolve] award rpc params", { p_session: sessionId, p_market: marketId });
      return NextResponse.json(
        { ok: false, error: "award_failed", details: awardError.message || String(awardError) },
        { status: 500 }
      );
    }

    if (
      !awardResult ||
      typeof awardResult !== "object" ||
      ("ok" in (awardResult as Record<string, unknown>) &&
        (awardResult as Record<string, unknown>).ok !== true)
    ) {
      console.error("[base-daily/resolve] award rpc returned unexpected payload", awardResult);
      return NextResponse.json(
        { ok: false, error: "award_invalid_response" },
        { status: 500 }
      );
    }

    const alreadyAwarded = Boolean(
      awardResult && typeof awardResult === "object" && "already_awarded" in awardResult
        ? (awardResult as Record<string, unknown>).already_awarded
        : existing?.awarded
    );
    const awardedCount =
      awardResult && typeof awardResult === "object" && "awarded_count" in awardResult
        ? Number((awardResult as Record<string, unknown>).awarded_count) || 0
        : 0;

    if (Array.isArray(sourcesInput) && sourcesInput.length > 0) {
      const allowedPhases = new Set(["baseline", "pre", "final"]);
      const rows = sourcesInput
        .map((entry: unknown) => {
          if (!entry || typeof entry !== "object") return null;
          const item = entry as Record<string, unknown>;
          const rawPhase = typeof item.phase === "string" ? item.phase.toLowerCase() : "";
          const phase = allowedPhases.has(rawPhase) ? rawPhase : "final";
          const source =
            typeof item.source === "string" && item.source.trim().length > 0
              ? item.source.trim()
              : "unknown";
          const payload = item.payload && typeof item.payload === "object" ? item.payload : {};
          const captured =
            typeof item.capturedAt === "string" && item.capturedAt.length > 0
              ? new Date(item.capturedAt).toISOString()
              : resolvedAt;
          try {
            const safePayload = JSON.parse(JSON.stringify(payload));
            return {
              session_id: sessionId,
              market_id: marketId,
              phase,
              source,
              payload: safePayload,
              captured_at: captured,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<{
          session_id: string;
          market_id: string;
          phase: string;
          source: string;
          payload: unknown;
          captured_at: string;
        }>;

      if (rows.length > 0) {
        const { error: metricsError } = await supabaseAdmin
          .from("base_daily_metrics_cache")
          .upsert(rows, { onConflict: "session_id,market_id,phase,source" });
        if (metricsError) {
          console.error("[base-daily/resolve] metrics upsert failed", metricsError);
        }
      }
    }

    let updatedPhase = sessionRow?.phase ?? null;

    const { data: allOutcomes, error: outcomesError } = await supabaseAdmin
      .from("base_daily_outcomes")
      .select("market_id, awarded")
      .eq("session_id", sessionId);

    if (!outcomesError && allOutcomes) {
      const totalMarkets = BASE_DAILY_MARKETS.length;
      const awardedMarkets = allOutcomes.filter((row) => row.awarded).length;
      const complete =
        allOutcomes.length === totalMarkets && awardedMarkets === totalMarkets;

      if (complete) {
        const { error: settleUpdateError } = await supabaseAdmin
          .from("base_daily_sessions")
          .update({
            phase: "settled",
            resolve_at: sessionRow?.resolve_at ?? resolvedAt,
          })
          .eq("session_id", sessionId);
        if (settleUpdateError) {
          console.error("[base-daily/resolve] session settle update failed", settleUpdateError);
        } else {
          updatedPhase = "settled";
        }
      } else if (sessionRow?.phase === "open") {
        const { error: lockUpdateError } = await supabaseAdmin
          .from("base_daily_sessions")
          .update({ phase: "locked" })
          .eq("session_id", sessionId);
        if (lockUpdateError) {
          console.error("[base-daily/resolve] session lock update failed", lockUpdateError);
        } else {
          updatedPhase = "locked";
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      marketId,
      outcome: outcomeRaw,
      resolvedAt,
      awardedCount,
      alreadyAwarded,
      phase: updatedPhase,
      winnersAwarded: awardedCount,
      winners: [] as string[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[base-daily/resolve] error", message);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 }
    );
  }
}
