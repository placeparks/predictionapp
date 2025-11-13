import { NextRequest, NextResponse } from "next/server";
import { getKalshiToken } from "../../kalshi/auth";

const BASE =
  process.env.KALSHI_PUBLIC_API_BASE ||
  "https://demo-api.kalshi.co/trade-api/v2"; // demo is best for testing

const DEMO_BASE = "https://demo-api.kalshi.co/trade-api/v2";
const ENABLE_DEMO_FALLBACK = process.env.KALSHI_ENABLE_DEMO_FALLBACK !== "false"; // Default: true, set to "false" to disable

// In-memory cache for API responses (use Redis in production)
const responseCache = new Map<string, { data: string; expires: number; status: number; headers: Record<string, string> }>();

// Cache TTLs (in milliseconds)
const CACHE_TTL = {
  markets: 30 * 1000, // 30 seconds for markets (frequently changing)
  tags: 5 * 60 * 1000, // 5 minutes for tags (rarely change)
  series: 2 * 60 * 1000, // 2 minutes for series
  default: 60 * 1000, // 1 minute default
};

// Request queue to prevent concurrent requests to same endpoint
const requestQueue = new Map<string, Promise<Response>>();

// Exponential backoff helper
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  baseDelay = 1000
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000),
      });
      
      // If rate limited (429) or server error (503), retry with backoff
      if (response.status === 429 || response.status === 503) {
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      const fetchError = error as Error & { name?: string };
      if (attempt < maxRetries - 1 && fetchError.name !== 'AbortError') {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

function getCacheKey(path: string, search: string): string {
  return `${path}${search}`;
}

function getCacheTTL(path: string): number {
  if (path.includes('/search/tags_by_categories')) return CACHE_TTL.tags;
  if (path.includes('/series')) return CACHE_TTL.series;
  if (path.includes('/markets')) return CACHE_TTL.markets;
  return CACHE_TTL.default;
}

function ensureApiBase(base: string): string {
  // If the provided base does not include the trade-api path, append it.
  // Handles values like https://api.elections.kalshi.com or https://trading-api.kalshi.com
  const lower = base.toLowerCase();
  if (lower.includes("/trade-api/")) return base.replace(/\/$/, "");
  return base.replace(/\/$/, "") + "/trade-api/v2";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const prefix = "/api/kalshi-public";
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
    // Ensure leading slash
    const pathWithSlash = path.startsWith("/") ? path : `/${path}`;
    const base1 = ensureApiBase(BASE);
    const target = `${base1}${pathWithSlash}${url.search}`;

    // Check cache first
    const cacheKey = getCacheKey(pathWithSlash, url.search);
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return new NextResponse(cached.data, {
        status: cached.status,
        headers: {
          ...cached.headers,
          "x-cache": "HIT",
          "x-cache-expires": new Date(cached.expires).toISOString(),
        },
      });
    }

    // Check if there's already a pending request for this endpoint (deduplication)
    const pendingRequest = requestQueue.get(cacheKey);
    if (pendingRequest) {
      const response = await pendingRequest;
      return response;
    }

    // Try to attach Authorization if available (production endpoints may require it)
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "CardifyMiniApp/1.0",
    };
    try {
      const token = await getKalshiToken();
      if (token) headers["authorization"] = `Bearer ${token}`;
    } catch (tokenErr) {
      const errorMsg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
      console.warn("[Kalshi Proxy] Token retrieval failed (non-fatal):", errorMsg);
      // Continue without auth - public endpoints should work
    }

    // Create request promise and add to queue
    const requestPromise = (async () => {
      let upstream: Response;
      let usedFallback = false;
      try {
        upstream = await fetchWithRetry(target, {
          method: "GET",
          headers,
          cache: "no-store",
          redirect: "follow",
        });
      
        // If production API returns 503 or 5xx, try demo API as fallback (if enabled)
        if ((upstream.status >= 500 || upstream.status === 503) && BASE !== DEMO_BASE && ENABLE_DEMO_FALLBACK) {
          const demoTarget = `${DEMO_BASE}${pathWithSlash}${url.search}`;
          try {
            const demoResponse = await fetchWithRetry(demoTarget, {
              method: "GET",
              headers: { accept: "application/json", "user-agent": "CardifyMiniApp/1.0" },
              cache: "no-store",
              redirect: "follow",
            });
            if (demoResponse.ok || demoResponse.status < 500) {
              upstream = demoResponse;
              usedFallback = true;
              if (Math.random() < 0.1) {
                console.warn("[Kalshi Proxy] Production API unavailable, using demo API as fallback");
              }
            }
          } catch {
            // Demo also failed, continue with original response
          }
        }
      } catch (fetchErr) {
        // If production API fails completely, try demo API as fallback (if enabled)
        if (BASE !== DEMO_BASE && ENABLE_DEMO_FALLBACK) {
          const demoTarget = `${DEMO_BASE}${pathWithSlash}${url.search}`;
          try {
            const demoResponse = await fetchWithRetry(demoTarget, {
              method: "GET",
              headers: { accept: "application/json", "user-agent": "CardifyMiniApp/1.0" },
              cache: "no-store",
              redirect: "follow",
            });
            if (demoResponse.ok) {
              upstream = demoResponse;
              usedFallback = true;
              if (Math.random() < 0.1) {
                console.warn("[Kalshi Proxy] Production API failed, using demo API as fallback");
              }
            } else {
              throw fetchErr; // Both failed, throw original error
            }
          } catch {
            // Both production and demo failed
            const errorMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
            if (Math.random() < 0.1) {
              console.warn("[Kalshi Proxy] Both production and demo API unavailable:", {
                target: new URL(target).pathname,
                error: errorMsg,
              });
            }
            throw fetchErr; // Re-throw to be handled below
          }
        } else {
          // Already using demo, no fallback available
          throw fetchErr;
        }
      }

      let text: string;
      try {
        text = await upstream.text();
      } catch (textErr) {
        const errorMsg = textErr instanceof Error ? textErr.message : String(textErr);
        console.error("[Kalshi Proxy] Failed to read response text:", errorMsg);
        throw new Error(`Failed to read response: ${errorMsg}`);
      }

      // Cache successful responses
      if (upstream.ok || upstream.status < 500) {
        const ttl = getCacheTTL(pathWithSlash);
        responseCache.set(cacheKey, {
          data: text,
          expires: Date.now() + ttl,
          status: upstream.status,
          headers: Object.fromEntries(upstream.headers.entries()),
        });
        
        // Clean up old cache entries periodically (keep cache size reasonable)
        if (responseCache.size > 100) {
          const now = Date.now();
          for (const [key, value] of responseCache.entries()) {
            if (now >= value.expires) {
              responseCache.delete(key);
            }
          }
        }
      }

      // Pass through upstream status/content-type
      const responseHeaders: Record<string, string> = {
        "content-type": upstream.headers.get("content-type") || "application/json",
      };
      if (usedFallback) {
        responseHeaders["x-kalshi-fallback"] = "demo";
      }
      responseHeaders["x-cache"] = "MISS";
      
      return new NextResponse(text, {
        status: upstream.status,
        headers: responseHeaders,
      });
    })();

    // Add to queue and remove when done
    requestQueue.set(cacheKey, requestPromise);
    try {
      const response = await requestPromise;
      return response;
    } finally {
      requestQueue.delete(cacheKey);
    }
  } catch (err) {
    const error = err as Error & { message?: string; stack?: string; name?: string };
    const errorMsg = error?.message || "Unknown error";
    // Handle errors from request promise
    if (errorMsg.includes("Kalshi API unavailable") || errorMsg.includes("Network error") || errorMsg.includes("fetch failed")) {
      return NextResponse.json(
        { ok: false, error: "Kalshi API unavailable", details: errorMsg, retry: true },
        { status: 503 }
      );
    }
    
    console.error("[Kalshi Proxy] Unexpected error:", {
      message: errorMsg,
      stack: error?.stack,
      name: error?.name,
    });
    return NextResponse.json(
      { ok: false, error: errorMsg, details: String(err) },
      { status: 500 }
    );
  }
}
