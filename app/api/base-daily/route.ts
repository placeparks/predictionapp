"use server";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import {
  BASE_DAILY_MARKETS,
  computeBaseDailySession,
  previousSessionId,
  isValidSessionId,
} from "@/lib/baseDaily";

type EntryRow = { market_id: string; side_yes: boolean };
type OutcomeRow = {
  session_id: string;
  market_id: string;
  outcome_yes: boolean;
  resolved_at: string | null;
  awarded: boolean;
  awarded_at: string | null;
};
type UserPickRow = { market_id: string; side_yes: boolean };
type SessionRow = {
  session_id: string;
  phase: "open" | "locked" | "settled" | "break";
  open_at: string;
  lock_at: string;
  resolve_at: string;
  anchor_time: string | null;
  anchor_block: number | null;
  metrics: Record<string, unknown> | null;
  updated_at: string;
};

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/;

const toIso = (value: Date) => value.toISOString();

interface MarketStats {
  id: string;
  title: string;
  description: string;
  category: string;
  yesLabel: string;
  noLabel: string;
  stats: {
    currentYes: number;
    currentNo: number;
    userPick: "yes" | "no" | null;
    outcome: "yes" | "no" | null;
    resolvedAt: string | null;
    awarded: boolean;
    awardedAt: string | null;
  };
  previous: {
    sessionId: string;
    outcome: "yes" | "no";
    resolvedAt: string | null;
    awardedAt: string | null;
    winners: number;
    participants: number;
  } | null;
}

async function fetchCounts(
  sessionId: string
): Promise<Record<string, number>> {
  if (!supabaseAdmin) return {};
  const { data, error } = await supabaseAdmin
    .from("base_daily_entries")
    .select("market_id, side_yes")
    .eq("session_id", sessionId);
  if (error || !data) return {};
  const map: Record<string, number> = {};
  (data as EntryRow[]).forEach((row) => {
    const side = row.side_yes ? "yes" : "no";
    const key = `${row.market_id}:${side}`;
    map[key] = (map[key] ?? 0) + 1;
  });
  return map;
}

const deriveSessionPhase = (
  computedPhase: string,
  dbPhase?: string | null
): "open" | "locked" | "settled" | "break" => {
  const normalized = (dbPhase || "").toLowerCase();
  if (normalized === "open" || normalized === "locked" || normalized === "settled" || normalized === "break") {
    return normalized;
  }
  const computedNormalized = (computedPhase || "").toLowerCase();
  if (computedNormalized === "open" || computedNormalized === "locked" || computedNormalized === "settled" || computedNormalized === "break") {
    return computedNormalized;
  }
  return "break";
};

async function fetchUserPicks(
  sessionId: string,
  user: string | null
): Promise<Record<string, "yes" | "no">> {
  if (!supabaseAdmin || !user) return {};
  const { data, error } = await supabaseAdmin
    .from("base_daily_entries")
    .select("market_id, side_yes")
    .eq("session_id", sessionId)
    .eq("user_address", user);
  if (error || !data) return {};
  const map: Record<string, "yes" | "no"> = {};
  (data as UserPickRow[]).forEach((row) => {
    map[row.market_id] = row.side_yes ? "yes" : "no";
  });
  return map;
}

async function fetchOutcomes(
  sessionIds: string[]
): Promise<Record<string, Record<string, OutcomeRow>>> {
  if (!supabaseAdmin || sessionIds.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from("base_daily_outcomes")
    .select("session_id, market_id, outcome_yes, resolved_at, awarded, awarded_at")
    .in("session_id", Array.from(new Set(sessionIds)));
  if (error || !data) return {};
  const map: Record<string, Record<string, OutcomeRow>> = {};
  (data as OutcomeRow[]).forEach((row) => {
    if (!map[row.session_id]) {
      map[row.session_id] = {};
    }
    map[row.session_id][row.market_id] = row;
  });
  return map;
}

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 }
    );
  }

  const url = req.nextUrl;
  const rawUser = url.searchParams.get("user");
  const user = rawUser && ADDRESS_REGEX.test(rawUser.toLowerCase())
    ? rawUser.toLowerCase()
    : null;

  const session = computeBaseDailySession();
  const previousId = previousSessionId(session.sessionId);

  const sessionIds: string[] = [session.sessionId];
  if (previousId) sessionIds.push(previousId);

  const { data: sessionRows } = await supabaseAdmin
    .from("base_daily_sessions")
    .select("*")
    .in("session_id", sessionIds);

  const sessionMap = new Map<string, SessionRow>();
  (sessionRows as SessionRow[] | null)?.forEach((row) => {
    sessionMap.set(row.session_id, row);
  });

  const [currentCounts, previousCounts, userPicks, outcomesMap] =
    await Promise.all([
      fetchCounts(session.sessionId),
      fetchCounts(previousId),
      fetchUserPicks(session.sessionId, user),
      fetchOutcomes([session.sessionId, previousId]),
    ]);

  const currentOutcomes = outcomesMap[session.sessionId] || {};
  const previousOutcomes = outcomesMap[previousId] || {};

  const currentSessionRow = sessionMap.get(session.sessionId);
  const previousSessionRow = sessionMap.get(previousId);

  const sessionPhase = deriveSessionPhase(session.phase, currentSessionRow?.phase);
  const openAtIso = currentSessionRow?.open_at ?? toIso(session.openAt);
  const lockAtIso = currentSessionRow?.lock_at ?? toIso(session.lockAt);
  const resolveAtIso = currentSessionRow?.resolve_at ?? toIso(session.resolveAt);
  const anchorTimeIso = currentSessionRow?.anchor_time ?? null;
  const anchorBlock =
    typeof currentSessionRow?.anchor_block === "number"
      ? currentSessionRow.anchor_block
      : null;

  const sessionPayload = {
    id: session.sessionId,
    phase: sessionPhase,
    openAt: openAtIso,
    lockAt: lockAtIso,
    closeAt: lockAtIso,
    resolveAt: resolveAtIso,
    nextOpenAt: toIso(session.nextOpenAt),
    anchorTime: anchorTimeIso,
    anchorBlock,
    metrics: currentSessionRow?.metrics ?? {},
    updatedAt: currentSessionRow?.updated_at ?? null,
  };

  const payload: MarketStats[] = BASE_DAILY_MARKETS.map((market) => {
    const yesKey = `${market.id}:yes`;
    const noKey = `${market.id}:no`;
    const currentOutcome = currentOutcomes[market.id];
    const previousOutcome = previousOutcomes[market.id];

    const prevYes = previousCounts[yesKey] ?? 0;
    const prevNo = previousCounts[noKey] ?? 0;
    const prevParticipants = prevYes + prevNo;
    const prevWinners =
      previousOutcome
        ? previousOutcome.outcome_yes
          ? prevYes
          : prevNo
        : 0;

    return {
      id: market.id,
      title: market.title,
      description: market.description,
      category: market.category,
      yesLabel: market.yesLabel ?? "Yes",
      noLabel: market.noLabel ?? "No",
      stats: {
        currentYes: currentCounts[yesKey] ?? 0,
        currentNo: currentCounts[noKey] ?? 0,
        userPick: userPicks[market.id] ?? null,
        outcome: currentOutcome ? (currentOutcome.outcome_yes ? "yes" : "no") : null,
        resolvedAt: currentOutcome?.resolved_at ?? null,
        awarded: Boolean(currentOutcome?.awarded),
        awardedAt: currentOutcome?.awarded_at ?? null,
      },
      previous: previousOutcome
        ? {
            sessionId: previousId,
            outcome: previousOutcome.outcome_yes ? "yes" : "no",
            resolvedAt: previousOutcome.resolved_at,
            awardedAt: previousOutcome.awarded_at,
            winners: prevWinners,
            participants: prevParticipants,
          }
        : null,
    };
  });

  return NextResponse.json({
    ok: true,
    serverTime: new Date().toISOString(),
    session: sessionPayload,
    previousSession: isValidSessionId(previousId)
      ? {
          id: previousId,
          phase: previousSessionRow?.phase ?? null,
          resolveAt: previousSessionRow?.resolve_at ?? null,
          anchorTime: previousSessionRow?.anchor_time ?? null,
          updatedAt: previousSessionRow?.updated_at ?? null,
        }
      : null,
    markets: payload,
  });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const rawUser = String(body?.user || "").toLowerCase();
    const marketId = String(body?.marketId || "");
    const side = String(body?.side || "").toLowerCase();
    const sessionId = String(body?.sessionId || "");

    if (!ADDRESS_REGEX.test(rawUser)) {
      return NextResponse.json(
        { ok: false, error: "invalid_address" },
        { status: 400 }
      );
    }

    const market = BASE_DAILY_MARKETS.find((m) => m.id === marketId);
    if (!market) {
      return NextResponse.json(
        { ok: false, error: "invalid_market" },
        { status: 400 }
      );
    }

    if (side !== "yes" && side !== "no") {
      return NextResponse.json(
        { ok: false, error: "invalid_side" },
        { status: 400 }
      );
    }

    const computedSession = computeBaseDailySession();
    const { data: sessionRowData } = await supabaseAdmin
      .from("base_daily_sessions")
      .select("*")
      .eq("session_id", computedSession.sessionId)
      .maybeSingle();

    const sessionRow = sessionRowData as SessionRow | null;
    const effectivePhase = deriveSessionPhase(
      computedSession.phase,
      sessionRow?.phase
    );

    const lockIso =
      sessionRow?.lock_at ?? toIso(computedSession.lockAt);
    const lockMs = new Date(lockIso).getTime();

    if (effectivePhase !== "open" || Date.now() >= lockMs) {
      return NextResponse.json(
        {
          ok: false,
          error: "market_locked",
          message: `Current phase is ${effectivePhase}. Predictions can only be recorded while open.`,
        },
        { status: 403 }
      );
    }

    if (sessionId && sessionId !== computedSession.sessionId) {
      return NextResponse.json(
        {
          ok: false,
          error: "session_mismatch",
          message: `Session ${sessionId} is not currently open.`,
        },
        { status: 409 }
      );
    }

    const { data: existingEntry, error: existingError } = await supabaseAdmin
      .from("base_daily_entries")
      .select("side_yes, created_at")
      .eq("session_id", computedSession.sessionId)
      .eq("market_id", marketId)
      .eq("user_address", rawUser)
      .maybeSingle();

    if (existingError) {
      console.error("[base-daily] existing entry fetch failed", existingError);
      return NextResponse.json(
        { ok: false, error: "prediction_lookup_failed" },
        { status: 500 }
      );
    }

    const desiredYes = side === "yes";

    if (existingEntry) {
      if (existingEntry.side_yes !== desiredYes) {
        return NextResponse.json(
          {
            ok: false,
            error: "prediction_locked",
            message: "Prediction already submitted and locked until the next session.",
          },
          { status: 409 }
        );
      }
    }

    // Spend energy only for new entries (not updates)
    // Each Base Daily prediction costs 30 energy (same as regular predictions)
    const ENERGY_COST = 30;
    let energySpent = false;

    if (!existingEntry) {
      // Check if user has enough energy
      try {
        const spendRes = await supabaseAdmin.rpc("spend_energy", { 
          p_user: rawUser, 
          p_amount: ENERGY_COST 
        });
        
        if (spendRes.error) {
          console.error("[base-daily] spend_energy RPC error:", spendRes.error);
          return NextResponse.json({ 
            ok: false, 
            error: "spend_energy_failed", 
            message: spendRes.error.message || String(spendRes.error)
          }, { status: 500 });
        }
        
        if (!spendRes.data) {
          // Get current energy to show user
          const { data: energyInfo } = await supabaseAdmin.rpc("get_energy_info", {
            p_user: rawUser,
          });
          const currentEnergy = energyInfo && typeof energyInfo === "object" && "energy" in energyInfo
            ? Number((energyInfo as { energy: number }).energy)
            : 0;
          
          return NextResponse.json({ 
            ok: false, 
            error: "insufficient_energy", 
            message: `You have ${currentEnergy} energy but need ${ENERGY_COST} energy to make a prediction. Energy refills every 15 minutes.` 
          }, { status: 402 });
        }
        
        energySpent = true;
      } catch (rpcErr) {
        const errorMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
        console.error("[base-daily] spend_energy RPC exception:", rpcErr);
        return NextResponse.json({ 
          ok: false, 
          error: "spend_energy_exception", 
          message: errorMsg 
        }, { status: 500 });
      }
    }

    let createdAt = existingEntry?.created_at ?? new Date().toISOString();

    if (!existingEntry) {
      const { data, error } = await supabaseAdmin
        .from("base_daily_entries")
        .insert([
          {
            session_id: computedSession.sessionId,
            market_id: marketId,
            user_address: rawUser,
            side_yes: desiredYes,
          },
        ])
        .select("session_id, market_id, side_yes, created_at")
        .single();

      if (error || !data) {
        console.error("[base-daily] Failed to insert entry", error);
        
        // Refund energy if insert failed
        if (energySpent) {
          try {
            await supabaseAdmin.rpc("grant_energy", {
              p_user: rawUser,
              p_amount: ENERGY_COST,
            });
          } catch (refundErr) {
            console.error("[base-daily] Failed to refund energy after insert failure:", refundErr);
          }
        }
        
        return NextResponse.json(
          { ok: false, error: "prediction_failed" },
          { status: 500 }
        );
      }

      createdAt = data.created_at;

      // Handle referral code processing for first Base Daily prediction (similar to regular predictions)
      // This ensures referral is created when user actually starts using the platform
      try {
        const { data: existingBaseDailyEntries } = await supabaseAdmin
          .from("base_daily_entries")
          .select("id")
          .eq("user_address", rawUser)
          .limit(1);
        
        // If this is the first Base Daily prediction, check for referral
        if (!existingBaseDailyEntries || existingBaseDailyEntries.length === 1) {
          // Check if user was referred (already in database)
          const { data: referralCheck } = await supabaseAdmin
            .from("referrals")
            .select("id, referrer_address")
            .eq("referred_address", rawUser)
            .maybeSingle();
          
          // If referral exists, check activity (will mark as active after 3 days)
          if (referralCheck) {
            try {
              await supabaseAdmin.rpc("check_referral_activity", {
                p_referred_address: rawUser,
              });
            } catch (activityErr) {
              // Non-fatal: referral activity check failed, but prediction should continue
              console.warn("[base-daily] Referral activity check failed (non-fatal):", activityErr);
            }
          }
        }
      } catch (referralErr) {
        // Non-fatal: continue with prediction even if referral check fails
        console.warn("[base-daily] Referral check error (non-fatal, continuing normally):", referralErr);
      }
    }

    const { data: tallyRows, error: tallyError } = await supabaseAdmin
      .from("base_daily_entries")
      .select("side_yes")
      .eq("session_id", computedSession.sessionId)
      .eq("market_id", marketId);

    if (tallyError) {
      console.error("[base-daily] Failed to fetch tallies", tallyError);
    }

    let yesVotes = 0;
    let noVotes = 0;
    if (tallyRows) {
      (tallyRows as EntryRow[]).forEach((row) => {
        if (row.side_yes) yesVotes += 1;
        else noVotes += 1;
      });
    }

    return NextResponse.json({
      ok: true,
      entry: {
        sessionId: computedSession.sessionId,
        marketId,
        side,
        createdAt,
        locked: true,
      },
      tallies: {
        yes: yesVotes,
        no: noVotes,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[base-daily] POST error", message);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 }
    );
  }
}
