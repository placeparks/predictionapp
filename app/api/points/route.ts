import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    const url = new URL(req.url);
    const user = (url.searchParams.get("user") || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(user)) return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("points_balances")
      .select("points")
      .eq("user_address", user)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    // Handle numeric type from PostgreSQL - it might be a string
    const pointsValue = data?.points;
    const betTokens = pointsValue != null ? Number(pointsValue) : 0;
    return NextResponse.json({ ok: true, points: betTokens, bet_tokens: betTokens }); // Keep 'points' for backward compatibility
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

