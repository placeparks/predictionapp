// app/api/kalshi/home/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

interface MarketRaw {
  yes_bid?: number | null;
  last_price?: number | null;
  ticker?: string;
  title?: string;
  no_bid?: number | null;
  volume?: number;
  close_time?: string | null;
  [key: string]: unknown;
}

interface EventRaw {
  ticker?: string;
  title?: string;
  category?: string;
  series_ticker?: string;
  close_time?: string | null;
  icon_url?: string;
  [key: string]: unknown;
}

interface EventResponse {
  events?: EventRaw[];
  [key: string]: unknown;
}

interface MarketsResponse {
  markets?: MarketRaw[];
  [key: string]: unknown;
}

const pctFrom = (m: MarketRaw) => {
  const v =
    typeof m?.yes_bid === "number"
      ? m.yes_bid
      : typeof m?.last_price === "number"
      ? m.last_price
      : null;
  return v === null ? "—" : `${v}%`;
};

const toJSONsafe = async (res: Response) => {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { _raw: txt };
  }
};

export async function GET(req: NextRequest) {
  try {
    // IMPORTANT: build absolute URL to your proxy using the current origin
    const origin = req.nextUrl.origin;
    const P = (p: string) => `${origin}/api/kalshi${p}`;

    // 1) fetch events
    const evRes = await fetch(P(`/events?status=open&limit=30`), {
      cache: "no-store",
      headers: { accept: "application/json" },
      // 15s guard (Node 18+)
      signal: (globalThis as { AbortSignal?: { timeout?: (ms: number) => AbortSignal } }).AbortSignal?.timeout?.(15000),
    });

    if (!evRes.ok) {
      const body = await toJSONsafe(evRes);
      return NextResponse.json(
        { ok: false, where: "events", status: evRes.status, body },
        { status: 502 }
      );
    }

    const evJson = await evRes.json() as EventResponse;
    const events: EventRaw[] = Array.isArray(evJson?.events) ? evJson.events : [];
    if (events.length === 0) {
      return NextResponse.json({ ok: true, cards: [] }, { status: 200 });
    }

    // 2) fetch markets per event (cap concurrency)
    const maxConcurrent = 6;
    const chunks: EventRaw[][] = [];
    for (let i = 0; i < events.length; i += maxConcurrent) {
      chunks.push(events.slice(i, i + maxConcurrent));
    }

    const composed: Array<{ event: EventRaw; markets: MarketRaw[]; total_volume: number }> = [];
    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (ev) => {
          const url = P(`/markets?event_ticker=${encodeURIComponent(ev.ticker || "")}`);
          try {
            const mRes = await fetch(url, {
              cache: "no-store",
              headers: { accept: "application/json" },
              signal: (globalThis as { AbortSignal?: { timeout?: (ms: number) => AbortSignal } }).AbortSignal?.timeout?.(15000),
            });
            if (!mRes.ok) {
              return { ev, markets: [], total_volume: 0 };
            }
            const mJson = await mRes.json() as MarketsResponse;
            const markets: MarketRaw[] = Array.isArray(mJson?.markets) ? mJson.markets : [];
            const total_volume = markets.reduce((s, m) => s + (m?.volume || 0), 0);
            return { ev, markets, total_volume };
          } catch {
            return { ev, markets: [], total_volume: 0 };
          }
        })
      );

      results.forEach((r) => {
        composed.push({
          event: {
            ticker: r.ev?.ticker,
            title: r.ev?.title,
            category: r.ev?.category,
            series_ticker: r.ev?.series_ticker,
            close_time: r.ev?.close_time,
            icon_url: r.ev?.icon_url,
          },
          markets: r.markets || [],
          total_volume: r.total_volume || 0,
        });
      });
    }

    // 3) sort by volume and trim markets per card
    composed.sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0));

    const cards = composed.map((c) => ({
      event: c.event,
      markets: [...(c.markets || [])]
        .sort((a, b) => (b?.volume || 0) - (a?.volume || 0))
        .slice(0, 4)
        .map((m) => ({
          ticker: m?.ticker,
          title: m?.title,
          yes_pct: pctFrom(m),
          yes_bid: typeof m?.yes_bid === "number" ? m.yes_bid : null,
          no_bid: typeof m?.no_bid === "number" ? m.no_bid : null,
          volume: m?.volume || 0,
          close_time: m?.close_time || null,
        })),
      total_volume: c.total_volume || 0,
    }));

    return NextResponse.json({ ok: true, cards }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, where: "composer", message },
      { status: 500 }
    );
  }
}
