import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const API = "https://api.elections.kalshi.com/v1";

interface KalshiApiResponse {
  current_page?: unknown[];
  series?: unknown[];
  results?: unknown[];
  items?: unknown[];
  data?: {
    current_page?: unknown[];
    series?: unknown[];
    results?: unknown[];
    items?: unknown[];
  };
  [key: string]: unknown;
}

interface KalshiSeriesRaw {
  event_title?: string;
  series_title?: string;
  title?: string;
  series_ticker?: string;
  ticker?: string;
  category?: string;
  total_series_volume?: number;
  total_volume?: number;
  markets?: KalshiMarketRaw[];
  [key: string]: unknown;
}

interface KalshiMarketRaw {
  ticker?: string;
  market_id?: string;
  yes_subtitle?: string;
  title?: string;
  yes_bid?: number | null;
  no_bid?: number | null;
  last_price?: number | null;
  volume?: number | null;
  close_ts?: string | null;
  close_time?: string | null;
  live_type?: string | null;
  [key: string]: unknown;
}

const read = async (r: Response): Promise<unknown> => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _raw: t }; }
};

// Normalize Kalshi variants → always return an array of series
function pickSeries(body: unknown): unknown[] {
  if (!body || typeof body !== "object") return [];
  const apiBody = body as KalshiApiResponse;
  if (Array.isArray(apiBody.current_page)) return apiBody.current_page;
  if (Array.isArray(apiBody.series)) return apiBody.series;
  if (Array.isArray(apiBody.results)) return apiBody.results;
  if (Array.isArray(apiBody.items)) return apiBody.items;
  if (apiBody.data) {
    if (Array.isArray(apiBody.data.current_page)) return apiBody.data.current_page;
    if (Array.isArray(apiBody.data.series)) return apiBody.data.series;
    if (Array.isArray(apiBody.data.results)) return apiBody.data.results;
    if (Array.isArray(apiBody.data.items)) return apiBody.data.items;
  }
  return [];
}

export async function GET(req: NextRequest) {
  const u = new URL(req.url);

  // Defaults mirror kalshi.com home feed
  const order_by = u.searchParams.get("order_by") ?? "trending";
  const status = u.searchParams.get("status") ?? "open,unopened";
  const page_size = u.searchParams.get("page_size") ?? "50";
  const with_milestones = u.searchParams.get("with_milestones") ?? "true";
  const hydrate = u.searchParams.get("hydrate") ?? "milestones";
  const category = u.searchParams.get("category") ?? ""; // optional
  const debug = u.searchParams.get("debug") ?? "0";

  const qs = new URLSearchParams({
    order_by, status, page_size, with_milestones, hydrate,
  });
  if (category && category.toLowerCase() !== "all") qs.set("category", category);

  const upstream = `${API}/search/series?${qs.toString()}`;

  try {
    const r = await fetch(upstream, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = await read(r);

    if (!r.ok) {
      return NextResponse.json(
        { ok:false, where:"upstream", status:r.status, upstream, body },
        { status: 502 }
      );
    }

    const rawSeries = pickSeries(body);

    // Transform Kalshi API format to frontend format
    const series = rawSeries.map((s: unknown) => {
      const seriesItem = s as KalshiSeriesRaw;
      return {
        title: seriesItem.event_title || seriesItem.series_title || seriesItem.title || "",
        event_title: seriesItem.event_title || seriesItem.series_title || seriesItem.title || "",
        ticker: seriesItem.series_ticker || seriesItem.ticker || "",
        series_ticker: seriesItem.series_ticker || seriesItem.ticker || "",
        category: seriesItem.category || "",
        total_volume: seriesItem.total_series_volume || seriesItem.total_volume || 0,
        total_series_volume: seriesItem.total_series_volume || seriesItem.total_volume || 0,
        // Convert markets array to milestones array
        milestones: (seriesItem.markets || []).map((m: unknown) => {
          const market = m as KalshiMarketRaw;
          return {
            id: market.ticker || market.market_id || "",
            title: market.yes_subtitle || market.title || "",
            yes_bid: market.yes_bid ?? null,
            no_bid: market.no_bid ?? null,
            last_price: market.last_price ?? null,
            volume: market.volume ?? null,
            close_time: market.close_ts || market.close_time || null,
            live_type: market.live_type || null,
          };
        }),
        // Keep markets for backward compatibility
        markets: seriesItem.markets || [],
      };
    });

    if (debug === "1") {
      return NextResponse.json({
        ok: true,
        upstream,
        body_keys: Object.keys(body || {}),
        raw_count: rawSeries.length,
        transformed_count: series.length,
        sample_raw: rawSeries[0] ?? null,
        sample_transformed: series[0] ?? null
      });
    }

    return NextResponse.json({ ok:true, count: series.length, series }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok:false, where:"fetch_failed", message, upstream },
      { status: 502 }
    );
  }
}
