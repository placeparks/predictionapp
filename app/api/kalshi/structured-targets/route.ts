import { NextResponse } from "next/server";
export const dynamic = "force-dynamic", runtime = "nodejs";

export async function GET() {
  const url = "https://api.elections.kalshi.com/v1/structured_targets/?page_size=1000";
  const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const text = await r.text();
  return new NextResponse(text, { status: r.status, headers: { "content-type": "application/json" } });
}
