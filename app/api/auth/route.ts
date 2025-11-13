import { NextRequest, NextResponse } from 'next/server';
import { createSign } from 'crypto';
import { getTokenCache, setTokenCache } from '../auth';

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_DEMO_API_BASE = 'https://demo-api.kalshi.co/trade-api/v2';

/**
 * Generate authentication signature using RSA private key
 */
function generateSignature(
  method: string,
  path: string,
  body: string,
  timestamp: string,
  privateKey: string
): string {
  // Create the message to sign: timestamp + method + path + body
  const message = timestamp + method.toUpperCase() + path + body;
  
  // Create signature
  const sign = createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  
  const signature = sign.sign(privateKey, 'base64');
  return signature;
}

/**
 * Get authentication headers for Kalshi API
 */
function getAuthHeaders(method: string, path: string, body: string = ''): Record<string, string> {
  const apiKeyId = process.env.KALSHI_API_KEY_ID;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;
  
  if (!apiKeyId || !privateKey) {
    throw new Error('KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY are required');
  }

  const timestamp = Date.now().toString();
  const signature = generateSignature(method, path, body, timestamp, privateKey);

  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'KALSHI-ACCESS-KEY': apiKeyId,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestamp
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { useDemo = false } = body;

    // Check if we have API key credentials
    const hasApiKey = process.env.KALSHI_API_KEY_ID && process.env.KALSHI_PRIVATE_KEY;
    const hasEmailPassword = process.env.KALSHI_EMAIL && process.env.KALSHI_PASSWORD;

    if (!hasApiKey && !hasEmailPassword) {
      return NextResponse.json(
        { 
          error: 'Kalshi credentials not configured. Please set either KALSHI_API_KEY_ID + KALSHI_PRIVATE_KEY or KALSHI_EMAIL + KALSHI_PASSWORD',
          details: 'Check your .env.local file'
        },
        { status: 400 }
      );
    }

    const baseUrl = useDemo ? KALSHI_DEMO_API_BASE : KALSHI_API_BASE;

    // Use API key authentication if available
    if (hasApiKey) {
      try {
        const path = '/trade-api/v2/login';
        const headers = getAuthHeaders('POST', path, '{}');
        
        const response = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers
        });

        if (!response.ok) {
          const error = await response.json();
          return NextResponse.json(
            { error: 'Kalshi API key authentication failed', details: error },
            { status: response.status }
          );
        }

        const data = await response.json();
        
        // Cache token (expires in 30 minutes)
        setTokenCache({
          token: data.token,
          expires: Date.now() + 29 * 60 * 1000,
          memberId: data.member_id
        });

        return NextResponse.json({
          ok: true,
          token: data.token,
          memberId: data.member_id,
          expiresIn: 29 * 60,
          authMethod: 'api_key'
        });
      } catch (error) {
        console.error('API key auth error:', error);
        // Fall back to email/password if available
        if (!hasEmailPassword) {
          throw error;
        }
      }
    }

    // Fall back to email/password authentication
    if (hasEmailPassword) {
      const response = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          email: process.env.KALSHI_EMAIL,
          password: process.env.KALSHI_PASSWORD
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return NextResponse.json(
          { error: 'Kalshi authentication failed', details: error },
          { status: response.status }
        );
      }

      const data = await response.json();
      
      setTokenCache({
        token: data.token,
        expires: Date.now() + 29 * 60 * 1000,
        memberId: data.member_id
      });

      return NextResponse.json({
        ok: true,
        token: data.token,
        memberId: data.member_id,
        expiresIn: 29 * 60,
        authMethod: 'email_password'
      });
    }

    return NextResponse.json(
      { error: 'No valid authentication method available' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Kalshi auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return cached token if valid
  const tokenCache = getTokenCache();
  if (tokenCache.token && Date.now() < tokenCache.expires) {
    return NextResponse.json({
      ok: true,
      token: tokenCache.token,
      memberId: tokenCache.memberId,
      expiresIn: Math.floor((tokenCache.expires - Date.now()) / 1000)
    });
  }

  // Token expired or not found
  return NextResponse.json(
    { error: 'No valid token. Please authenticate.' },
    { status: 401 }
  );
}
