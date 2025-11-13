import { NextRequest, NextResponse } from 'next/server';
import { getKalshiToken } from '../../auth';

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://trading-api.kalshi.com/trade-api/v2';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    const searchParams = req.nextUrl.searchParams;
    const depth = searchParams.get('depth') || '10';

    const token = await getKalshiToken();
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(
      `${KALSHI_API_BASE}/markets/${ticker}/orderbook?depth=${depth}`,
      { headers }
    );

    if (!response.ok) {
      const details = await response.json().catch(() => undefined);
      const statusCode = response.status;
      const message = statusCode === 401 || statusCode === 403
        ? 'Kalshi orderbook requires authentication. Add API Key ID + Private Key or Email/Password.'
        : 'Failed to fetch orderbook';
      return NextResponse.json(
        { error: message, details },
        { status: statusCode }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      ok: true,
      orderbook: {
        yes: data.orderbook?.yes || [],
        no: data.orderbook?.no || []
      }
    });
  } catch (error) {
    console.error('Kalshi orderbook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
