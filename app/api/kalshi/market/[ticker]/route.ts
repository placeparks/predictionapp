import { NextRequest, NextResponse } from 'next/server';
import { getKalshiToken } from '../../auth';

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://trading-api.kalshi.com/trade-api/v2';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;

    const token = await getKalshiToken();

    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${KALSHI_API_BASE}/markets/${ticker}`, { headers });

    if (!response.ok) {
      const details = await response.json().catch(() => undefined);
      const statusCode = response.status;
      const message = statusCode === 401 || statusCode === 403
        ? 'Kalshi market details require authentication. Add API Key ID + Private Key or Email/Password.'
        : 'Failed to fetch market';
      return NextResponse.json(
        { error: message, details },
        { status: statusCode }
      );
    }

    const data = await response.json();
    const market = data.market;

    return NextResponse.json({
      ok: true,
      market: {
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
        yesSubTitle: market.yes_sub_title,
        noSubTitle: market.no_sub_title,
        rules: market.rules,
        notionalValue: market.notional_value
      }
    });
  } catch (error) {
    console.error('Kalshi market detail error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
