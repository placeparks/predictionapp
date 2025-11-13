import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    if (process.env.ALLOW_DEV_POINTS_PURCHASE !== "true") {
      return NextResponse.json({ ok: false, error: "disabled" }, { status: 403 });
    }
    const body = await req.json();
    const address = (body?.address || "").toLowerCase();
    const amount = Number(body?.amount || 0);
    if (!/^0x[a-f0-9]{40}$/.test(address)) return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });

    const { error } = await supabaseAdmin.rpc("grant_points", { p_user: address, p_amount: amount });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

