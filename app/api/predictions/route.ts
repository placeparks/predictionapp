import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { isAddress } from "viem";
import { BASE_DAILY_MARKETS } from "@/lib/baseDaily";

const ENERGY_COST = Number(process.env.PREDICTION_ENERGY_COST || "30");

interface KalshiPrediction {
  id: string;
  user_address: string;
  vault_id: number;
  period_id: number;
  market_id: string;
  side_yes: boolean;
  stake_points: number;
  nonce: number;
  deadline: number;
  signature: string;
  created_at: string;
  settled?: boolean;
  settled_at?: string | null;
  won?: boolean | null;
  market_title?: string | null;
  market_ticker?: string | null;
  prediction_type?: string;
  source?: string;
  stake_amount?: number | null;
  leverage?: number | null;
  weight?: number | null;
  payout_amount?: number | null;
  pnl_amount?: number | null;
}

interface BaseDailyEntry {
  id: string;
  session_id: string;
  market_id: string;
  user_address: string;
  side_yes: boolean;
  created_at: string;
}

interface BaseDailyOutcome {
  session_id: string;
  market_id: string;
  outcome_yes: boolean;
  resolved_at: string | null;
  awarded: boolean;
}

interface CombinedPrediction {
  id: string;
  user_address: string;
  market_id: string;
  market_title?: string | null;
  market_ticker?: string | null;
  side_yes: boolean;
  created_at: string;
  prediction_type: "kalshi" | "base_daily";
  source: string;
  session_id?: string;
  resolved?: boolean;
  won?: boolean | null;
  outcome_yes?: boolean | null;
  resolved_at?: string | null;
  settled?: boolean;
  settled_at?: string | null;
  awarded?: boolean;
  stake_points?: number | null;
  stake_amount?: number | null;
  leverage?: number | null;
  weight?: number | null;
  payout_amount?: number | null;
  pnl_amount?: number | null;
}

export async function POST(req: NextRequest) {
  let userAddress: string | undefined;
  
  const refundEnergy = async () => {
    if (!supabaseAdmin || !userAddress) return;
    try {
      await supabaseAdmin.rpc("grant_energy", {
        p_user: userAddress,
        p_amount: ENERGY_COST,
      });
    } catch (err) {
      console.warn("Failed to refund energy (non-fatal):", err);
    }
  };

  try {
    const body = await req.json();
    const { 
      user, 
      marketId, 
      periodId, 
      sideYes, 
      marketTitle, 
      marketTicker, 
      referralCode, 
      vaultId,
    } = body as {
      user: string;
      marketId: string;
      periodId: number | string;
      sideYes: boolean;
      marketTitle?: string;
      marketTicker?: string;
      referralCode?: string;
      vaultId?: number | string;
    };

    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    
    // Validate required fields
    if (!user || !marketId || periodId === undefined || sideYes === undefined) {
      console.error("Invalid payload:", { hasUser: !!user, hasMarketId: !!marketId, hasPeriodId: periodId !== undefined, hasSideYes: sideYes !== undefined });
      return NextResponse.json({ ok: false, error: "invalid_payload", message: "Missing required fields: user, marketId, periodId, or sideYes" }, { status: 400 });
    }
    
    if (!isAddress(user)) {
      console.error("Invalid user address:", user);
      return NextResponse.json({ ok: false, error: "invalid_user", message: `Invalid user address: ${user}` }, { status: 400 });
    }

    userAddress = user.toLowerCase();

    // Check if user has enough energy
    try {
      const spendRes = await supabaseAdmin.rpc("spend_energy", { 
        p_user: userAddress, 
        p_amount: ENERGY_COST 
      });
      
      if (spendRes.error) {
        console.error("spend_energy RPC error:", spendRes.error);
        return NextResponse.json({ 
          ok: false, 
          error: "spend_energy_failed", 
          message: spendRes.error.message || String(spendRes.error), 
          details: String(spendRes.error) 
        }, { status: 500 });
      }
      
      if (!spendRes.data) {
        // Get current energy to show user
        const { data: energyInfo } = await supabaseAdmin.rpc("get_energy_info", {
          p_user: userAddress,
        });
        const currentEnergy = energyInfo && typeof energyInfo === "object" && "energy" in energyInfo
          ? Number((energyInfo as { energy: number }).energy)
          : 0;
        
        return NextResponse.json({ 
          ok: false, 
          error: "insufficient_energy", 
          message: `You have ${currentEnergy} energy but need ${ENERGY_COST} energy to make a prediction. Energy refills 10 units every 15 minutes (Tier 4/5: every 10 minutes).` 
        }, { status: 402 });
      }
    } catch (rpcErr) {
      const errorMsg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      console.error("spend_energy RPC exception:", rpcErr);
      return NextResponse.json({ 
        ok: false, 
        error: "spend_energy_exception", 
        message: errorMsg 
      }, { status: 500 });
    }

    // Check for referral code and process referral if this is user's first prediction
    // This ensures referral is created when user actually starts using the platform
    // NOTE: This is completely optional - if there's no referral, everything works normally
    try {
      const { data: existingPredictions } = await supabaseAdmin
        .from("predictions")
        .select("id")
        .eq("user_address", userAddress)
        .limit(1);
      
      // If this is the first prediction, check for referral
      if (!existingPredictions || existingPredictions.length === 0) {
        // Check if user was referred (already in database)
        const { data: referralCheck, error: referralCheckError } = await supabaseAdmin
          .from("referrals")
          .select("id, referrer_address")
          .eq("referred_address", userAddress)
          .maybeSingle();
        
        // If referral exists, check activity (will mark as active after 3 days)
        if (referralCheck && !referralCheckError) {
          try {
            await supabaseAdmin.rpc("check_referral_activity", {
              p_referred_address: userAddress,
            });
          } catch (activityErr) {
            // Non-fatal: referral activity check failed, but prediction should continue
            console.warn("Referral activity check failed (non-fatal):", activityErr);
          }
        } else if (referralCode && typeof referralCode === "string" && referralCode.trim().length > 0) {
          // No referral in database yet - try to create from referral code
          try {
            const { data: createResult, error: createError } = await supabaseAdmin.rpc("create_referral_from_code", {
              p_referral_code: referralCode.trim(),
              p_referred_address: userAddress,
            });
            
            if (!createError && createResult?.ok) {
              console.log(`[predictions] Created referral for ${user} from referral code ${referralCode}`);
              // Process rewards immediately
              try {
                const { error: rewardError } = await supabaseAdmin.rpc("process_referral_rewards", {
                  p_referred_address: userAddress,
                });
                if (rewardError) {
                  console.warn("Referral reward processing failed (non-fatal):", rewardError);
                }
              } catch (rewardErr) {
                console.warn("Referral reward processing failed (non-fatal):", rewardErr);
              }
            } else if (createError) {
              console.warn("Referral creation failed (non-fatal):", createError.message);
            } else if (createResult && !createResult.ok) {
              console.warn(`Referral code validation failed (non-fatal): ${createResult.error || "unknown"}`);
            }
          } catch (createErr) {
            console.warn("Referral creation error (non-fatal, continuing normally):", createErr);
          }
        }
      }
    } catch (referralErr) {
      // Non-fatal: continue with prediction even if referral check fails
      console.warn("Referral check error (non-fatal, continuing normally):", referralErr);
    }

    // Parse and validate period ID
    const VAULT_ID = vaultId ? (typeof vaultId === 'string' ? Number(vaultId) : vaultId) : 1; // Default to 1
    let periodIdNum = typeof periodId === 'string' ? Number(periodId) : periodId;
    
    // Check if period exists and if it has ended (automatic period advancement)
    const { data: periodData, error: periodError } = await supabaseAdmin
      .from("periods")
      .select("*")
      .eq("period_id", periodIdNum)
      .maybeSingle();
    
    if (periodError) {
      console.error("periods query error:", periodError);
      return NextResponse.json({ ok: false, error: "period_query_failed", message: periodError.message }, { status: 500 });
    }
    
    let actualPeriodId = periodIdNum;
    const now = new Date();
    
    if (periodData) {
      // Period exists - check if it has ended
      const endsAt = periodData.ends_at ? new Date(periodData.ends_at) : null;
      if (endsAt && now > endsAt && periodData.status === 'open') {
        // Period has ended, automatically advance to next period
        actualPeriodId = periodIdNum + 1;
        console.log(`Period ${periodIdNum} has ended (ended at ${endsAt.toISOString()}), advancing to period ${actualPeriodId}...`);
        
        // Close the old period
        await supabaseAdmin
          .from("periods")
          .update({ status: 'closed' })
          .eq("period_id", periodIdNum);
      } else {
        actualPeriodId = periodIdNum;
      }
    }
    
    // Check if the actual period (after advancement) exists, create it if it doesn't
    const { data: actualPeriodData, error: actualPeriodError } = await supabaseAdmin
      .from("periods")
      .select("period_id")
      .eq("period_id", actualPeriodId)
      .maybeSingle();
    
    if (actualPeriodError) {
      console.error("periods query error:", actualPeriodError);
      await refundEnergy();
      return NextResponse.json({ ok: false, error: "period_query_failed", message: actualPeriodError.message }, { status: 500 });
    }
    
    if (!actualPeriodData) {
      // Period doesn't exist, create it automatically
      console.log(`Period ${actualPeriodId} not found, creating it automatically...`);
      const { data: _newPeriod, error: createError } = await supabaseAdmin
        .from("periods")
        .insert({
          period_id: actualPeriodId,
          vault_id: VAULT_ID,
          status: 'open',
          starts_at: now.toISOString(),
          ends_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        })
        .select()
        .single();
      
      if (createError) {
        console.error("Failed to create period:", createError);
        return NextResponse.json({ ok: false, error: "period_creation_failed", message: `Failed to create period ${actualPeriodId}: ${createError.message}` }, { status: 500 });
      }
      
      console.log(`Period ${actualPeriodId} created successfully`);
    }
    
    // Use the actual period ID (may have been advanced)
    periodIdNum = actualPeriodId;

    // Save/update market metadata in markets table (for caching and status tracking)
    if (marketTicker) {
      try {
        await supabaseAdmin
          .from("markets")
          .upsert({
            market_id: marketId,
            ticker: marketTicker,
            title: marketTitle || null,
            subtitle: null,
            category: null,
            status: null, // Will be updated by settle/check
            close_ts: null,
            open_interest: null,
            volume: null,
            raw: null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "market_id",
            ignoreDuplicates: false
          });
      } catch (marketErr) {
        // Non-fatal: continue with prediction even if market metadata save fails
        console.warn("Failed to save market metadata (non-fatal):", marketErr);
      }
    }

    // Prevent duplicate predictions (same user/market/period/side)
    const { data: existingPrediction } = await supabaseAdmin
      .from("predictions")
      .select("id")
      .eq("user_address", userAddress)
      .eq("market_id", marketId)
      .eq("period_id", periodIdNum)
      .eq("side_yes", sideYes)
      .maybeSingle();

    if (existingPrediction) {
      await refundEnergy();
      return NextResponse.json(
        { ok: false, error: "duplicate_prediction", message: "You have already made this prediction" },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("predictions")
      .insert({
        user_address: userAddress,
        vault_id: VAULT_ID,
        period_id: periodIdNum,
        market_id: marketId,
        market_title: marketTitle || null,
        market_ticker: marketTicker || null,
        side_yes: sideYes,
        stake_points: ENERGY_COST,
        stake_amount: null,
        leverage: null,
        weight: null,
        nonce: Date.now(), // Use timestamp as nonce (for backward compatibility with DB schema)
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now (for backward compatibility)
        signature: "", // Empty signature (for backward compatibility with DB schema)
      })
      .select()
      .single();

    if (error) {
      // Unique violation handling
      interface PostgresError {
        code?: string;
        message?: string;
        [key: string]: unknown;
      }
      const pgError = error as unknown as PostgresError;
      const code = pgError?.code || "";
      if (code === "23505") {
        return NextResponse.json({ ok: false, error: "duplicate_prediction", message: "You have already made this prediction" }, { status: 409 });
      }
      // Foreign key violation (period_id doesn't exist)
      if (code === "23503") {
        return NextResponse.json({ ok: false, error: "period_not_found", message: `Period ${periodIdNum} does not exist in the periods table` }, { status: 400 });
      }
      console.error("predictions insert error:", error);
      return NextResponse.json({ ok: false, error: "db_insert_failed", message: error.message, details: String(error), code }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prediction: data });
  } catch (e) {
    await refundEnergy();
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      console.error("[predictions GET] Supabase admin not configured");
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }
    
    const url = new URL(req.url);
    const user = (url.searchParams.get("user") || "").toLowerCase();
    const periodId = url.searchParams.get("periodId");
    const marketId = url.searchParams.get("marketId");

    console.log("[predictions GET] Query params:", { user, periodId, marketId });

    // Fetch Kalshi predictions
    let kalshiPredictions: CombinedPrediction[] = [];
    if (!marketId || !marketId.startsWith("base-daily-")) {
      let q = supabaseAdmin.from("predictions").select("*", { count: "exact" }).order("created_at", { ascending: false });
      if (user) {
        if (!/^0x[a-f0-9]{40}$/.test(user)) {
          console.error("[predictions GET] Invalid user address format:", user);
          return NextResponse.json({ ok: false, error: "invalid_user_address", message: "Invalid address format" }, { status: 400 });
        }
        q = q.eq("user_address", user);
      }
      if (periodId) q = q.eq("period_id", periodId);
      if (marketId && !marketId.startsWith("base-daily-")) q = q.eq("market_id", marketId);
      
      const { data, error } = await q.limit(200);
      
      if (error) {
        console.error("[predictions GET] Database query error (Kalshi):", error);
        return NextResponse.json({ 
          ok: false, 
          error: "db_query_failed", 
          details: error.message,
          code: error.code,
          hint: error.hint 
        }, { status: 500 });
      }
      
      kalshiPredictions = (data || []).map((p: KalshiPrediction) => ({
        ...p,
        prediction_type: "kalshi" as const,
        source: "predictions",
      }));
    }

    // Fetch Base Daily predictions
    let baseDailyPredictions: CombinedPrediction[] = [];
    if (user && (!marketId || marketId.startsWith("base-daily-"))) {
      
      // Get all Base Daily entries for the user
      let baseQ = supabaseAdmin
        .from("base_daily_entries")
        .select("*")
        .eq("user_address", user)
        .order("created_at", { ascending: false });
      
      if (marketId && marketId.startsWith("base-daily-")) {
        baseQ = baseQ.eq("market_id", marketId.replace("base-daily-", ""));
      }
      
      const { data: baseData, error: baseError } = await baseQ.limit(200);
      
      if (baseError) {
        console.error("[predictions GET] Database query error (Base Daily):", baseError);
        // Don't fail completely, just log and continue
      } else if (baseData) {
        // Get outcomes separately for better join
        const sessionIds = [...new Set((baseData as BaseDailyEntry[]).map((e) => e.session_id))];
        const { data: outcomesData } = await supabaseAdmin
          .from("base_daily_outcomes")
          .select("*")
          .in("session_id", sessionIds);
        
        const outcomesMap = new Map<string, BaseDailyOutcome>();
        if (outcomesData) {
          (outcomesData as BaseDailyOutcome[]).forEach((o) => {
            outcomesMap.set(`${o.session_id}:${o.market_id}`, o);
          });
        }
        
        baseDailyPredictions = (baseData as BaseDailyEntry[]).map((entry) => {
          const outcome = outcomesMap.get(`${entry.session_id}:${entry.market_id}`);
          const market = BASE_DAILY_MARKETS.find((m) => m.id === entry.market_id);
          const won = outcome ? (entry.side_yes === outcome.outcome_yes) : null;
          
          return {
            id: entry.id,
            user_address: entry.user_address,
            market_id: `base-daily-${entry.market_id}`,
            market_title: market?.title || entry.market_id,
            market_ticker: `BASE-DAILY-${entry.market_id.toUpperCase()}`,
            side_yes: entry.side_yes,
            created_at: entry.created_at,
            prediction_type: "base_daily" as const,
            source: "base_daily_entries",
            session_id: entry.session_id,
            // Outcome information (map to match Kalshi prediction format)
            resolved: !!outcome,
            settled: !!outcome, // Map resolved to settled for dashboard compatibility
            won: won,
            outcome_yes: outcome?.outcome_yes ?? null,
            resolved_at: outcome?.resolved_at ?? null,
            settled_at: outcome?.resolved_at ?? null, // Map resolved_at to settled_at
            awarded: outcome?.awarded ?? false,
            // Base Daily specific fields
            stake_points: null, // Base Daily doesn't use stake_points
            stake_amount: null,
            leverage: null,
            weight: null,
            payout_amount: null,
            pnl_amount: null,
          };
        });
      }
    }
    
    // Combine and sort all predictions
    const allPredictions = [...kalshiPredictions, ...baseDailyPredictions].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA; // Most recent first
    });
    
    console.log("[predictions GET] Success, returning", allPredictions.length, "predictions (", kalshiPredictions.length, "Kalshi,", baseDailyPredictions.length, "Base Daily)");
    return NextResponse.json({ ok: true, predictions: allPredictions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[predictions GET] Unexpected error:", msg, stack);
    return NextResponse.json({ 
      ok: false, 
      error: "internal_error", 
      message: msg 
    }, { status: 500 });
  }
}
