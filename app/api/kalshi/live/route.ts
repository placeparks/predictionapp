import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API = "https://api.elections.kalshi.com/v1";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const type = u.searchParams.get("type"); // e.g. basketball_game | golf_tournament
  const id = u.searchParams.get("id");     // milestone id

  if (!type || !id) {
    return NextResponse.json({ ok:false, message:"type and id are required" }, { status: 400 });
  }

  const upstream = `${API}/live_data/${encodeURIComponent(type)}/milestone/${encodeURIComponent(id)}`;
  try {
    const r = await fetch(upstream, { headers: { accept: "application/json" }, cache: "no-store" });
    const body = await r.json();
    if (!r.ok) return NextResponse.json({ ok:false, status:r.status, body }, { status: 502 });
    return NextResponse.json({ ok:true, upstream, data: body }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok:false, message, upstream }, { status: 502 });
  }
}
