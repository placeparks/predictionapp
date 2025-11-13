// app/api/kalshi/orderbooks/route.ts
import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const tickers = u.searchParams.get("market_tickers");
  if (!tickers) return NextResponse.json({ ok:false, message:"market_tickers required" }, { status:400 });
  const r = await fetch(`https://api.elections.kalshi.com/v1/order_books/?market_tickers=${encodeURIComponent(tickers)}`);
  const data = await r.json();
  return NextResponse.json({ ok:true, data });
}
