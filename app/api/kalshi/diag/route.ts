import { NextResponse } from "next/server";
import dns from "node:dns/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_URL = "https://api.elections.kalshi.com/trade-api/v2/markets?limit=1&status=open";

export async function GET() {
  const start = Date.now();
  let dnsA: string[] | string = [];
  let dnsAAAA: string[] | string = [];
  let httpOk = false;
  let httpStatus = 0;
  let sample = "";
  let errMsg = "";

  try { 
    dnsA = await dns.resolve4("api.elections.kalshi.com"); 
  } catch (e: unknown) { 
    dnsA = e instanceof Error ? e.message : "resolve4 failed"; 
  }
  try { 
    dnsAAAA = await dns.resolve6("api.elections.kalshi.com"); 
  } catch (e: unknown) { 
    dnsAAAA = e instanceof Error ? e.message : "resolve6 failed"; 
  }

  try {
    const res = await fetch(TEST_URL, {
      headers: { accept: "application/json", "user-agent": "kalshi-proxy/diag" },
      cache: "no-store",
      signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
    });
    httpStatus = res.status;
    httpOk = res.ok;
    sample = (await res.text()).slice(0, 200);
  } catch (e: unknown) {
    errMsg = e instanceof Error ? e.message : "fetch failed";
  }

  return NextResponse.json({
    dnsA, dnsAAAA, httpOk, httpStatus, latency_ms: Date.now() - start, errMsg, sample
  }, { status: httpOk ? 200 : 502 });
}
