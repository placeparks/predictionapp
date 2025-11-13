import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * Get the current active period
 * Automatically advances to next period if current period has ended
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    const url = new URL(req.url);
    const basePeriodId = url.searchParams.get("base_period_id") || "1";
    const vaultId = url.searchParams.get("vault_id") || "1";
    
    const basePeriodIdNum = Number(basePeriodId);
    const vaultIdNum = Number(vaultId);
    
    if (!Number.isFinite(basePeriodIdNum) || !Number.isFinite(vaultIdNum)) {
      return NextResponse.json({ ok: false, error: "invalid_params", message: "base_period_id and vault_id must be numbers" }, { status: 400 });
    }

    // Get the base period
    const { data: periodData, error: periodError } = await supabaseAdmin
      .from("periods")
      .select("*")
      .eq("period_id", basePeriodIdNum)
      .eq("vault_id", vaultIdNum)
      .maybeSingle();
    
    if (periodError) {
      console.error("periods query error:", periodError);
      return NextResponse.json({ ok: false, error: "period_query_failed", message: periodError.message }, { status: 500 });
    }
    
    let actualPeriodId = basePeriodIdNum;
    const now = new Date();
    
    if (periodData) {
      // Period exists - check if it has ended
      const endsAt = periodData.ends_at ? new Date(periodData.ends_at) : null;
      if (endsAt && now > endsAt && periodData.status === 'open') {
        // Period has ended, automatically advance to next period
        actualPeriodId = basePeriodIdNum + 1;
        console.log(`Period ${basePeriodIdNum} has ended, advancing to period ${actualPeriodId}...`);
        
        // Close the old period
        await supabaseAdmin
          .from("periods")
          .update({ status: 'closed' })
          .eq("period_id", basePeriodIdNum)
          .eq("vault_id", vaultIdNum);
      } else {
        actualPeriodId = basePeriodIdNum;
      }
    }
    
    // Get the actual period (after advancement)
    const { data: actualPeriodData, error: actualPeriodError } = await supabaseAdmin
      .from("periods")
      .select("*")
      .eq("period_id", actualPeriodId)
      .eq("vault_id", vaultIdNum)
      .maybeSingle();
    
    if (actualPeriodError) {
      console.error("periods query error:", actualPeriodError);
      return NextResponse.json({ ok: false, error: "period_query_failed", message: actualPeriodError.message }, { status: 500 });
    }
    
    if (!actualPeriodData) {
      // Period doesn't exist, create it automatically
      console.log(`Period ${actualPeriodId} not found, creating it automatically...`);
      const { data: newPeriod, error: createError } = await supabaseAdmin
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
      
      return NextResponse.json({
        ok: true,
        period: {
          period_id: actualPeriodId,
          vault_id: vaultIdNum,
          status: 'open',
          starts_at: newPeriod.starts_at,
          ends_at: newPeriod.ends_at,
          created_at: newPeriod.created_at,
        },
        advanced: actualPeriodId !== basePeriodIdNum,
        previous_period_id: actualPeriodId !== basePeriodIdNum ? basePeriodIdNum : null
      });
    }
    
    return NextResponse.json({
      ok: true,
      period: {
        period_id: actualPeriodData.period_id,
        vault_id: actualPeriodData.vault_id,
        status: actualPeriodData.status,
        starts_at: actualPeriodData.starts_at,
        ends_at: actualPeriodData.ends_at,
        created_at: actualPeriodData.created_at,
      },
      advanced: actualPeriodId !== basePeriodIdNum,
      previous_period_id: actualPeriodId !== basePeriodIdNum ? basePeriodIdNum : null
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Get current period error:", msg);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}


