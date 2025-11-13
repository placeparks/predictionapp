import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = "https://api.elections.kalshi.com/v1";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const tickers = u.searchParams.get("series_tickers");

  if (!tickers) {
    return NextResponse.json({ ok:false, message:"series_tickers required" }, { status:400 });
  }

  const upstream = `${BASE}/series/?series_tickers=${encodeURIComponent(tickers)}`;

  try {
    const r = await fetch(upstream, { headers: { accept: "application/json" }, cache: "no-store" });
    const data = await r.json();
    if (!r.ok) return NextResponse.json({ ok:false, status:r.status, data }, { status:502 });
    return NextResponse.json({ ok:true, data, upstream });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok:false, message }, { status:502 });
  }
}
