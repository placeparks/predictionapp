import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * Check if a period can be closed
 * Returns unsettled predictions count and warnings
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    const url = new URL(req.url);
    const periodId = url.searchParams.get("period_id");
    
    if (!periodId) {
      return NextResponse.json({ ok: false, error: "invalid_payload", message: "period_id is required" }, { status: 400 });
    }

    const periodIdNum = Number(periodId);
    if (!Number.isFinite(periodIdNum)) {
      return NextResponse.json({ ok: false, error: "invalid_period_id", message: "period_id must be a number" }, { status: 400 });
    }

    // Get period info
    const { data: period, error: periodError } = await supabaseAdmin
      .from("periods")
      .select("*")
      .eq("period_id", periodIdNum)
      .maybeSingle();

    if (periodError) {
      console.error("Error fetching period:", periodError);
      return NextResponse.json({ ok: false, error: "fetch_period_failed", message: periodError.message }, { status: 500 });
    }

    if (!period) {
      return NextResponse.json({ ok: false, error: "period_not_found", message: `Period ${periodIdNum} does not exist` }, { status: 404 });
    }

    // Count unsettled predictions in this period
    const { count: unsettledCount, error: countError } = await supabaseAdmin
      .from("predictions")
      .select("*", { count: "exact", head: true })
      .eq("period_id", periodIdNum)
      .eq("settled", false)
      .is("settled_at", null);

    if (countError) {
      console.error("Error counting unsettled predictions:", countError);
      return NextResponse.json({ ok: false, error: "count_predictions_failed", message: countError.message }, { status: 500 });
    }

    // Count total predictions
    const { count: totalCount, error: totalError } = await supabaseAdmin
      .from("predictions")
      .select("*", { count: "exact", head: true })
      .eq("period_id", periodIdNum);

    if (totalError) {
      console.error("Error counting total predictions:", totalError);
      return NextResponse.json({ ok: false, error: "count_total_failed", message: totalError.message }, { status: 500 });
    }

    const unsettled = unsettledCount ?? 0;
    const canClose = unsettled === 0;
    const warning = unsettled > 0 
      ? `Period has ${unsettled} unsettled predictions. They can still be settled later even after the period closes (cross-period settlement).`
      : null;

    return NextResponse.json({
      ok: true,
      period: {
        period_id: periodIdNum,
        status: period.status,
        starts_at: period.starts_at,
        ends_at: period.ends_at,
      },
      predictions: {
        total: totalCount || 0,
        unsettled: unsettledCount || 0,
        settled: (totalCount || 0) - (unsettledCount || 0)
      },
      can_close: canClose,
      warning
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Check close error:", msg);
    return NextResponse.json({ ok: false, error: "internal_error", message: msg }, { status: 500 });
  }
}


