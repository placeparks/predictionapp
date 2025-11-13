import { NextRequest, NextResponse } from 'next/server';
import { getKalshiToken } from '../auth';

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://trading-api.kalshi.com/trade-api/v2';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, action, side, yesPrice, noPrice, count } = body;

    // Validate inputs
    if (!ticker || !action || !side || !count) {
      return NextResponse.json(
        { error: 'Missing required fields: ticker, action, side, count' },
        { status: 400 }
      );
    }

    const token = await getKalshiToken();
    if (!token) {
      return NextResponse.json(
        { error: 'Failed to authenticate with Kalshi' },
        { status: 401 }
      );
    }

    // Determine price in cents (Kalshi uses cents)
    const price = side === 'yes' ? Math.round((yesPrice || 0.5) * 100) : Math.round((noPrice || 0.5) * 100);

    const orderPayload = {
      ticker,
      action, // 'buy' or 'sell'
      side, // 'yes' or 'no'
      type: 'limit', // or 'market'
      yes_price: side === 'yes' ? price : undefined,
      no_price: side === 'no' ? price : undefined,
      count: parseInt(count),
      expiration_ts: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
    };

    const response = await fetch(`${KALSHI_API_BASE}/portfolio/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: 'Failed to create order', details: error },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      ok: true,
      order: data.order
    });
  } catch (error) {
    console.error('Kalshi create order error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
