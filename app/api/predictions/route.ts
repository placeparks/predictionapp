import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { verifyTypedData, isAddress, createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

type RecordMessage = {
  user: `0x${string}`;
  vaultId: bigint | string;
  periodId: bigint | string;
  marketId: `0x${string}`; // bytes32
  sideYes: boolean;
  stakePoints: bigint | string;
  nonce: bigint | string;
  deadline: bigint | string; // seconds
};

interface EIP712Types {
  EIP712Domain: Array<{ name: string; type: string }>;
  Record: Array<{ name: string; type: string }>;
  [key: string]: Array<{ name: string; type: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, types, typesName, message, signature, marketTitle, marketTicker } = body as {
      domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
      types: EIP712Types;
      typesName: string;
      message: RecordMessage;
      signature: `0x${string}`;
      marketTitle?: string;
      marketTicker?: string;
    };

    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    if (!domain || !types || !message || !signature) {
      console.error("Invalid payload:", { hasDomain: !!domain, hasTypes: !!types, hasMessage: !!message, hasSignature: !!signature });
      return NextResponse.json({ ok: false, error: "invalid_payload", message: "Missing required fields: domain, types, message, or signature" }, { status: 400 });
    }
    if (typesName !== "Record") {
      console.error("Invalid typesName:", typesName);
      return NextResponse.json({ ok: false, error: "invalid_types", message: `Expected typesName "Record", got "${typesName}"` }, { status: 400 });
    }
    if (!isAddress(message.user)) {
      console.error("Invalid user address:", message.user);
      return NextResponse.json({ ok: false, error: "invalid_user", message: `Invalid user address: ${message.user}` }, { status: 400 });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const deadlineNum = typeof message.deadline === 'string' ? Number(message.deadline) : Number(message.deadline);
    if (deadlineNum <= nowSec) {
      console.error("Deadline expired:", { deadline: deadlineNum, now: nowSec });
      return NextResponse.json({ ok: false, error: "deadline_expired", message: `Deadline ${deadlineNum} is in the past (now: ${nowSec})` }, { status: 400 });
    }

    const envRegistry = process.env.NEXT_PUBLIC_FORECAST_REGISTRY;
    if (envRegistry && envRegistry.toLowerCase() !== String(domain.verifyingContract).toLowerCase()) {
      console.error("Verifying contract mismatch:", { expected: envRegistry, got: domain.verifyingContract });
      return NextResponse.json({ ok: false, error: "verifying_contract_mismatch", message: `Expected ${envRegistry}, got ${domain.verifyingContract}` }, { status: 400 });
    }

    // Convert string values back to BigInt for verification (viem expects BigInt)
    const messageForVerify = {
      user: message.user,
      vaultId: typeof message.vaultId === 'string' ? BigInt(message.vaultId) : message.vaultId,
      periodId: typeof message.periodId === 'string' ? BigInt(message.periodId) : message.periodId,
      marketId: message.marketId,
      sideYes: message.sideYes,
      stakePoints: typeof message.stakePoints === 'string' ? BigInt(message.stakePoints) : message.stakePoints,
      nonce: typeof message.nonce === 'string' ? BigInt(message.nonce) : message.nonce,
      deadline: typeof message.deadline === 'string' ? BigInt(message.deadline) : message.deadline,
    };

    const valid = await verifyTypedData({
      address: message.user,
      domain,
      types,
      primaryType: "Record",
      message: messageForVerify,
      signature,
    });
    if (!valid) return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });

    // Soft-cap by ForecastVault shares if configured
    const vaultAddr = (process.env.NEXT_PUBLIC_FORECAST_VAULT_ADDRESS || process.env.FORECAST_VAULT_ADDRESS || "").toLowerCase();
    if (vaultAddr && /^0x[a-f0-9]{40}$/.test(vaultAddr)) {
      try {
        const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
        const apiKey = process.env.ALCHEMY_API_KEY;
        const rpcUrl = chainId === 8453
          ? (apiKey ? `https://base-mainnet.g.alchemy.com/v2/${apiKey}` : undefined)
          : (apiKey ? `https://base-sepolia.g.alchemy.com/v2/${apiKey}` : undefined);
        const client = createPublicClient({ chain: chainId === 8453 ? base : baseSepolia, transport: http(rpcUrl) });

        const erc20Abi = [
          { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
          { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
        ] as const;

        const [shares, decimals] = await Promise.all([
          client.readContract({ address: vaultAddr as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [message.user] }) as Promise<bigint>,
          client.readContract({ address: vaultAddr as `0x${string}`, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
        ]);

        const pointsPerUsdc = Number(process.env.POINTS_PER_USDC || '1');
        const cap = Math.floor(Number(shares) / Math.pow(10, decimals) * pointsPerUsdc);
        const stakeNum = typeof message.stakePoints === 'string' ? Number(message.stakePoints) : Number(message.stakePoints.toString());
        if (Number.isFinite(cap) && stakeNum > cap) {
          return NextResponse.json({ ok: false, error: 'exceeds_cap', message: `Stake (${stakeNum}) exceeds your cap (${cap}). Deposit more USDC to the vault to increase your cap.`, cap }, { status: 400 });
        }
      } catch {
        // Non-fatal: skip cap enforcement if RPC fails
      }
    }

    // Spend energy atomically before recording prediction
    // Each prediction costs 30 energy (fixed cost)
    const ENERGY_COST = 30;

    // Check if user has enough energy
    try {
      const spendRes = await supabaseAdmin.rpc("spend_energy", { 
        p_user: message.user.toLowerCase(), 
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
          p_user: message.user.toLowerCase(),
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
        .eq("user_address", message.user.toLowerCase())
        .limit(1);
      
      // If this is the first prediction, check for referral
      if (!existingPredictions || existingPredictions.length === 0) {
        // Check if user was referred (already in database)
        const { data: referralCheck, error: referralCheckError } = await supabaseAdmin
          .from("referrals")
          .select("id, referrer_address")
          .eq("referred_address", message.user.toLowerCase())
          .maybeSingle();
        
        // If referral exists, check activity (will mark as active after 3 days)
        if (referralCheck && !referralCheckError) {
          try {
            await supabaseAdmin.rpc("check_referral_activity", {
              p_referred_address: message.user.toLowerCase(),
            });
          } catch (activityErr) {
            // Non-fatal: referral activity check failed, but prediction should continue
            console.warn("Referral activity check failed (non-fatal):", activityErr);
          }
        } else {
          // No referral in database yet - try to create from request body if referral code provided
          // This handles cases where the initial referral creation failed
          const referralCode = (body as { referralCode?: string })?.referralCode;
          if (referralCode && typeof referralCode === "string" && referralCode.trim().length > 0) {
            try {
              // Try using referral code system first
              const { data: createResult, error: createError } = await supabaseAdmin.rpc("create_referral_from_code", {
                p_referral_code: referralCode.trim(),
                p_referred_address: message.user.toLowerCase(),
              });
              
              if (!createError && createResult?.ok) {
                console.log(`[predictions] Created referral for ${message.user} from referral code ${referralCode}`);
                // Process rewards immediately
                await supabaseAdmin.rpc("process_referral_rewards", {
                  p_referred_address: message.user.toLowerCase(),
                }).catch((rewardErr) => {
                  console.warn("Referral reward processing failed (non-fatal):", rewardErr);
                });
              } else if (createError) {
                // Non-fatal: referral creation failed, but prediction should continue
                console.warn("Referral creation failed (non-fatal):", createError.message);
              } else if (createResult && !createResult.ok) {
                // Invalid referral code (self-referral, already used, etc.)
                console.warn(`Referral code validation failed (non-fatal): ${createResult.error || "unknown"}`);
              }
            } catch (createErr) {
              // Non-fatal: continue with prediction even if referral creation fails
              console.warn("Referral creation error (non-fatal, continuing normally):", createErr);
            }
          } else {
            // Fallback: try old system with wallet address for backward compatibility
            const referrerAddress = (body as { referrerAddress?: string })?.referrerAddress;
            if (referrerAddress && /^0x[a-f0-9]{40}$/i.test(referrerAddress)) {
              try {
                const { data: createResult, error: createError } = await supabaseAdmin.rpc("create_referral", {
                  p_referrer_address: referrerAddress.toLowerCase(),
                  p_referred_address: message.user.toLowerCase(),
                });
                
                if (!createError && createResult?.ok) {
                  console.log(`[predictions] Created referral for ${message.user} from referrer ${referrerAddress}`);
                  // Process rewards immediately
                  await supabaseAdmin.rpc("process_referral_rewards", {
                    p_referred_address: message.user.toLowerCase(),
                  }).catch((rewardErr) => {
                    console.warn("Referral reward processing failed (non-fatal):", rewardErr);
                  });
                } else if (createError) {
                  // Non-fatal: referral creation failed, but prediction should continue
                  console.warn("Referral creation failed (non-fatal):", createError.message);
                }
              } catch (createErr) {
                // Non-fatal: continue with prediction even if referral creation fails
                console.warn("Referral creation error (non-fatal, continuing normally):", createErr);
              }
            }
          }
        }
      }
    } catch (referralErr) {
      // Non-fatal: continue with prediction even if referral check fails
      // This ensures users without referrals can use the app normally
      console.warn("Referral check error (non-fatal, continuing normally):", referralErr);
    }

    // Insert prediction (unique by user+nonce)
    const vaultIdNum = typeof message.vaultId === 'string' ? Number(message.vaultId) : Number(message.vaultId.toString());
    let periodIdNum = typeof message.periodId === 'string' ? Number(message.periodId) : Number(message.periodId.toString());
    const nonceNum = typeof message.nonce === 'string' ? Number(message.nonce) : Number(message.nonce.toString());
    const deadlineNumForInsert = typeof message.deadline === 'string' ? Number(message.deadline) : Number(message.deadline.toString());
    
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
      return NextResponse.json({ ok: false, error: "period_query_failed", message: actualPeriodError.message }, { status: 500 });
    }
    
    if (!actualPeriodData) {
      // Period doesn't exist, create it automatically
      console.log(`Period ${actualPeriodId} not found, creating it automatically...`);
      const { data: _newPeriod, error: createError } = await supabaseAdmin
        .from("periods")
        .insert({
          period_id: actualPeriodId,
          vault_id: vaultIdNum,
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
    
    const { data, error } = await supabaseAdmin
      .from("predictions")
      .insert({
        user_address: message.user.toLowerCase(),
        vault_id: vaultIdNum,
        period_id: periodIdNum,
        market_id: message.marketId,
        market_title: marketTitle || null,
        market_ticker: marketTicker || null,
        side_yes: message.sideYes,
        stake_points: ENERGY_COST, // Store energy cost as stake_points for compatibility
        nonce: nonceNum,
        deadline: deadlineNumForInsert,
        signature,
      })
      .select()
      .single();

    if (error) {
      // rollback energy on insert failure
      try {
        // Refund the 30 energy that was spent
        await supabaseAdmin.rpc("grant_energy", { 
          p_user: message.user.toLowerCase(), 
          p_amount: ENERGY_COST 
        });
      } catch {}
      // Unique violation handling
      interface PostgresError {
        code?: string;
        message?: string;
        [key: string]: unknown;
      }
      const pgError = error as unknown as PostgresError;
      const code = pgError?.code || "";
      if (code === "23505") {
        return NextResponse.json({ ok: false, error: "nonce_already_used" }, { status: 409 });
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    const url = new URL(req.url);
    const user = (url.searchParams.get("user") || "").toLowerCase();
    const periodId = url.searchParams.get("periodId");
    const marketId = url.searchParams.get("marketId");

    let q = supabaseAdmin.from("predictions").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (user) q = q.eq("user_address", user);
    if (periodId) q = q.eq("period_id", periodId);
    if (marketId) q = q.eq("market_id", marketId);
    const { data, error } = await q.limit(200);
    if (error) return NextResponse.json({ ok: false, error: "db_query_failed", details: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, predictions: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}
