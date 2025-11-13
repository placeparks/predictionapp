import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // no caching by Next
// export const runtime = "edge"; // optional: use Edge runtime on Vercel

/**
 * Minimal 1:1 proxy for Kalshi API (CORS workaround)
 * Byte-for-byte pass-through with no auth, no cookies, no transformations.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const upstream = `https://api.elections.kalshi.com/trade-api/v2/${path.join("/")}${req.nextUrl.search}`;

    const r = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "CardifyMiniApp/1.0" },
    });

    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const error = err as Error & { code?: string; hostname?: string };
    console.error("[Kalshi Proxy] Fetch error:", {
      message: error?.message,
      code: error?.code,
      hostname: error?.hostname,
    });
    
    // Return a proper error response instead of crashing
    return NextResponse.json(
      {
        ok: false,
        error: "Kalshi API unavailable",
        details: error?.code === "ENOTFOUND" 
          ? "DNS resolution failed - check network connectivity"
          : error?.message || "Network error",
        code: error?.code,
      },
      { status: 503 }
    );
  }
}

// Not strictly needed for simple GETs, but harmless if a preflight ever happens.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

