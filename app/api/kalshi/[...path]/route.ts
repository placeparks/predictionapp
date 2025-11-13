import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const KALSHI_BASE = process.env.KALSHI_BASE ?? "https://api.elections.kalshi.com/trade-api/v2";
const UA = "kalshi-proxy/1.1 (+dashboard)";
const DEV_CORS_PROXY = process.env.DEV_CORS_PROXY || ""; // e.g. "https://corsproxy.io/?"

async function fetchWithTimeout(url: string, opts: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryUpstream(url: string, attempts = 3) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      // 20s per attempt
      const res = await fetchWithTimeout(url, {
        headers: { accept: "application/json", "user-agent": UA },
        cache: "no-store",
      }, 20_000);
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 300 + 400 * i));
    }
  }
  throw lastErr;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const urlIn = new URL(req.url);
  const joined = (path ?? []).join("/");
  const directUrl = `${KALSHI_BASE}/${joined}${urlIn.search}`;

  try {
    // 1) Try direct
    let r = await tryUpstream(directUrl, 2);

    // 2) Optional dev fallback via CORS proxy if direct failed or returned network error (rare)
    if (!r || r.status === 502 || r.status === 504) {
      if (DEV_CORS_PROXY) {
        const proxied = DEV_CORS_PROXY + encodeURIComponent(directUrl);
        r = await tryUpstream(proxied, 1);
      }
    }

    const buf = await r.arrayBuffer();
    const headers = new Headers(r.headers);
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-headers", "content-type");
    headers.set("cache-control", "no-store");
    if (!headers.get("content-type")) headers.set("content-type", "application/json");

    return new NextResponse(buf, { status: r.status, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    const body = {
      ok: false,
      reason: "proxy_fetch_failed",
      message,
      upstream: directUrl,
      hints: [
        "Set NODE_OPTIONS=--dns-result-order=ipv4first",
        "Try a different DNS (1.1.1.1 / 8.8.8.8)",
        "Temporarily set DEV_CORS_PROXY=https://corsproxy.io/? for local dev"
      ]
    };
    return NextResponse.json(body, { status: 502, headers: { "access-control-allow-origin": "*" } });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    },
  });
}
