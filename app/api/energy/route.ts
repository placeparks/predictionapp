import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * GET /api/energy?user=0x...
 * Returns current energy with refill information
 */
export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }
    
    const url = new URL(req.url);
    const user = (url.searchParams.get("user") || "").toLowerCase();
    
    if (!/^0x[a-f0-9]{40}$/.test(user)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    // Get energy info (includes refill calculation)
    const { data, error } = await supabaseAdmin.rpc("get_energy_info", {
      p_user: user,
    });

    if (error) {
      console.error("[energy] RPC error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_response" }, { status: 500 });
    }

    const energyInfo = data as {
      energy: number;
      max_energy: number;
      next_refill_in: number;
      is_full: boolean;
    };

    return NextResponse.json({
      ok: true,
      energy: energyInfo.energy,
      max_energy: energyInfo.max_energy,
      next_refill_in: energyInfo.next_refill_in,
      is_full: energyInfo.is_full,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[energy] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

