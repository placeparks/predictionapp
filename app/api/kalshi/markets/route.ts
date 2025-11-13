import { NextRequest, NextResponse } from 'next/server';
import { getKalshiToken } from '../auth';

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://trading-api.kalshi.com/trade-api/v2';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = searchParams.get('limit') || '100';
    const status = searchParams.get('status') || 'open'; // open, closed, settled
    const category = searchParams.get('category'); // e.g., 'crypto', 'economics'
    const cursor = searchParams.get('cursor');

    // Try to get auth token, but proceed without it if unavailable (read-only attempt)
    const token = await getKalshiToken();

    // Build query params
    const params = new URLSearchParams({
      limit,
      status
    });
    if (category) params.append('category', category);
    if (cursor) params.append('cursor', cursor);

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${KALSHI_API_BASE}/markets?${params}`, { headers });

    if (!response.ok) {
      const details = await response.json().catch(() => undefined);
      const statusCode = response.status;
      const message = statusCode === 401 || statusCode === 403
        ? 'Kalshi markets require authentication. Add API Key ID + Private Key or Email/Password.'
        : 'Failed to fetch markets';
      return NextResponse.json(
        { error: message, details },
        { status: statusCode }
      );
    }

    // Transform data for our frontend
    interface KalshiMarket {
      ticker: string;
      title?: string;
      subtitle?: string;
      category?: string;
      yes_bid?: number;
      no_bid?: number;
      last_price?: number;
      volume?: number;
      open_interest?: number;
      close_date?: string;
      expiration_date?: string;
      status?: string;
      can_close_early?: boolean;
      yes_sub_title?: string;
      no_sub_title?: string;
      floor_strike?: number;
      cap_strike?: number;
    }

    interface KalshiMarketsResponse {
      markets?: KalshiMarket[];
      cursor?: string;
    }

    const data = await response.json() as KalshiMarketsResponse;
    const markets = data.markets?.map((market: KalshiMarket) => ({
      id: market.ticker,
      question: market.title,
      subtitle: market.subtitle,
      category: market.category,
      yesPrice: market.yes_bid || market.last_price || 0.5,
      noPrice: market.no_bid || (1 - (market.yes_bid || 0.5)),
      volume: market.volume,
      openInterest: market.open_interest,
      expiresAt: market.close_date || market.expiration_date,
      status: market.status,
      canCloseEarly: market.can_close_early,
      yesSubTitle: market.yes_sub_title,
      noSubTitle: market.no_sub_title,
      floorPrice: market.floor_strike,
      capPrice: market.cap_strike
    })) || [];

    return NextResponse.json({
      ok: true,
      markets,
      cursor: data.cursor,
      hasMore: !!data.cursor
    });
  } catch (error) {
    console.error('Kalshi markets error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
