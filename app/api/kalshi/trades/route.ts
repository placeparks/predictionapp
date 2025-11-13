// app/api/kalshi/trades/route.ts
import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const ticker = u.searchParams.get("series_ticker");
  if (!ticker) return NextResponse.json({ ok:false, message:"series_ticker required" }, { status:400 });
  const r = await fetch(`https://api.elections.kalshi.com/v1/trades/?series_ticker=${encodeURIComponent(ticker)}`);
  const data = await r.json();
  return NextResponse.json({ ok:true, data });
}
