import { createSign } from 'crypto';

const KALSHI_API_BASE = process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_DEMO_API_BASE = 'https://demo-api.kalshi.co/trade-api/v2';

// In-memory token cache (use Redis in production)
let tokenCache: {
  token: string | null;
  expires: number;
  memberId: string | null;
} = {
  token: null,
  expires: 0,
  memberId: null
};

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

/**
 * Helper function for other routes to get token
 */
export async function getKalshiToken(useDemo = false): Promise<string | null> {
  // Return cached token if valid
  if (tokenCache.token && Date.now() < tokenCache.expires) {
    return tokenCache.token;
  }

  // Auto-login with available credentials
  try {
    const baseUrl = useDemo ? KALSHI_DEMO_API_BASE : KALSHI_API_BASE;
    const hasApiKey = process.env.KALSHI_API_KEY_ID && process.env.KALSHI_PRIVATE_KEY;

    // Try API key auth first
    if (hasApiKey) {
      try {
        const path = '/trade-api/v2/login';
        const headers = getAuthHeaders('POST', path, '{}');
        
        const response = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers
        });

        if (response.ok) {
          const data = await response.json();
          tokenCache = {
            token: data.token,
            expires: Date.now() + 29 * 60 * 1000,
            memberId: data.member_id
          };
          return data.token;
        }
      } catch (error) {
        console.error('API key auth failed, trying email/password...', error);
      }
    }

    // Fall back to email/password
    if (process.env.KALSHI_EMAIL && process.env.KALSHI_PASSWORD) {
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

      if (response.ok) {
        const data = await response.json();
        tokenCache = {
          token: data.token,
          expires: Date.now() + 29 * 60 * 1000,
          memberId: data.member_id
        };
        return data.token;
      }
    }

    return null;
  } catch (error) {
    console.error('Kalshi token retrieval error:', error);
    return null;
  }
}

// Export helper for getting auth headers (for direct API calls without login)
export function getKalshiAuthHeaders(method: string, path: string, body: string = ''): Record<string, string> {
  return getAuthHeaders(method, path, body);
}

// Export token cache getter/setter for route handlers
export function getTokenCache() {
  return tokenCache;
}

export function setTokenCache(cache: { token: string | null; expires: number; memberId: string | null }) {
  tokenCache = cache;
}

