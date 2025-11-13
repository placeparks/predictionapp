import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const start = Date.now();
  try {
    const res = await fetch("https://api.elections.kalshi.com/trade-api/v2/markets?limit=1&status=open", {
      headers: { accept: "application/json", "user-agent": "kalshi-proxy/health" },
      cache: "no-store",
      // 12s timeout
      signal: AbortSignal.timeout ? AbortSignal.timeout(12_000) : undefined
    });
    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      latency_ms: Date.now() - start,
      sample: text.slice(0, 200)
    }, { status: res.ok ? 200 : 502 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({
      ok: false,
      error: message,
      latency_ms: Date.now() - start
    }, { status: 502 });
  }
}
