import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

/**
 * Auto-settlement checker - Checks Kalshi for resolved markets and settles predictions
 * 
 * This endpoint:
 * 1. Finds all markets with unsettled predictions
 * 2. Checks Kalshi API for their current status
 * 3. If settled, determines the outcome and calls the settlement process
 * 
 * Can be called periodically via cron job or scheduled task
 * 
 * Authentication:
 * - Vercel cron jobs are automatically detected and allowed
 * - Can also use x-admin-key header or CRON_SECRET
 */
async function handleSettleCheck(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
    }

    // Check if request is from Vercel's internal network (cron jobs)
    // This allows the endpoint to be called by Vercel cron without additional auth
    const userAgent = req.headers.get("user-agent") || "";
    const isVercelCron = userAgent.includes("vercel-cron") || 
                         req.headers.get("x-vercel-cron") === "1";
    
    // Optional: Check for admin key or cron secret (for manual calls)
    const adminKey = req.headers.get("x-admin-key");
    const authHeader = req.headers.get("authorization") || "";
    const cronSecretFromAuth = authHeader.replace(/^Bearer\s+/i, "");
    const cronSecret = req.headers.get("x-cron-secret") || cronSecretFromAuth;
    const expectedCronSecret = process.env.CRON_SECRET || "";
    const ADMIN_KEY = process.env.ADMIN_API_KEY || process.env.BASE_DAILY_ADMIN_KEY || "";

    // Allow if it's a Vercel cron job OR if admin key/cron secret matches
    // Vercel sends CRON_SECRET in Authorization header as "Bearer ${CRON_SECRET}"
    const isAuthorized = isVercelCron || 
                        (ADMIN_KEY && adminKey === ADMIN_KEY) ||
                        (expectedCronSecret && cronSecret === expectedCronSecret) ||
                        process.env.NODE_ENV === "development";

    if (!isAuthorized) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "This endpoint requires authentication or must be called from Vercel cron" },
        { status: 401 }
      );
    }

    // Get all unique markets with unsettled predictions
    const { data: unsettledMarkets, error: marketsError } = await supabaseAdmin
      .from("predictions")
      .select("market_id, market_ticker")
      .eq("settled", false)
      .is("settled_at", null)
      .not("market_ticker", "is", null)
      .neq("market_ticker", ""); // Also exclude empty strings

    if (marketsError) {
      console.error("[settle/check] Error fetching unsettled markets:", marketsError);
      return NextResponse.json({ 
        ok: false, 
        error: "fetch_markets_failed", 
        message: marketsError.message 
      }, { status: 500 });
    }

    if (!unsettledMarkets || unsettledMarkets.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: "No unsettled predictions found",
        checked: 0,
        settled: 0,
        skipped: 0,
        errors: 0
      });
    }

    // Get unique market tickers
    const uniqueMarkets = new Map<string, string>();
    for (const market of unsettledMarkets) {
      if (market.market_ticker && !uniqueMarkets.has(market.market_id)) {
        uniqueMarkets.set(market.market_id, market.market_ticker);
      }
    }

    console.log(`[settle/check] Checking ${uniqueMarkets.size} markets for resolution...`);

    // Use public API - no authentication required
    // Use our public API proxy which handles caching and fallback
    const publicApiBase = new URL("/api/kalshi-public", req.nextUrl.origin).toString();

    const results = {
      checked: 0,
      settled: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{
        market_id: string;
        ticker: string;
        status: string;
        outcome?: boolean;
        error?: string;
      }>
    };

    // Check each market
    for (const [marketId, ticker] of uniqueMarkets.entries()) {
      if (!marketId || !ticker) {
        console.error("[settle/check] Skipping invalid market entry:", { marketId, ticker });
        results.errors++;
        results.details.push({
          market_id: marketId || "unknown",
          ticker: ticker || "unknown",
          status: "invalid_entry",
          error: "Missing market_id or ticker"
        });
        continue;
      }
      
      results.checked++;
      
      try {
        // Check if already settled in our outcomes table
        const { data: existingOutcome } = await supabaseAdmin
          .from("outcomes")
          .select("resolved, side_yes")
          .eq("market_id", marketId)
          .single();

        if (existingOutcome?.resolved) {
          // Already resolved, but predictions might not be settled yet
          // Call settle endpoint with known outcome
          const settleUrl = new URL("/api/settle", req.nextUrl.origin).toString();
          let settleResponse: Response;
          try {
            settleResponse = await fetch(settleUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                market_id: marketId,
                outcome_yes: existingOutcome.side_yes,
                source: "auto_settlement"
              })
            });
          } catch (fetchError) {
            const fetchErrorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
            console.error(`[settle/check] Error calling /api/settle for ${ticker}:`, fetchErrorMsg);
            results.errors++;
            results.details.push({
              market_id: marketId,
              ticker,
              status: "settle_fetch_failed",
              error: `Failed to call settle endpoint: ${fetchErrorMsg}`
            });
            continue;
          }

          if (settleResponse.ok) {
            results.settled++;
            results.details.push({
              market_id: marketId,
              ticker,
              status: "settled_from_cache",
              outcome: existingOutcome.side_yes
            });
          } else {
            results.errors++;
            results.details.push({
              market_id: marketId,
              ticker,
              status: "settle_failed",
              error: `Settlement failed: ${settleResponse.status}`
            });
          }
          continue;
        }

        // Fetch market from Kalshi public API (no authentication required)
        const marketUrl = `${publicApiBase}/markets/${ticker}`;
        
        console.log(`[settle/check] Fetching market ${ticker} from public API: ${marketUrl}`);
        const kalshiResponse = await fetch(marketUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'CardifyMiniApp/1.0'
          }
        });

        if (!kalshiResponse.ok) {
          if (kalshiResponse.status === 404) {
            // Update market status to "not_found" in markets table
            try {
              await supabaseAdmin
                .from("markets")
                .upsert({
                  market_id: marketId,
                  ticker: ticker,
                  title: null,
                  subtitle: null,
                  category: null,
                  status: "not_found",
                  close_ts: null,
                  open_interest: null,
                  volume: null,
                  raw: null,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: "market_id",
                  ignoreDuplicates: false
                });
            } catch (marketUpdateErr) {
              console.warn(`[settle/check] Failed to update market status for ${ticker} (non-fatal):`, marketUpdateErr);
            }
            
            results.skipped++;
            results.details.push({
              market_id: marketId,
              ticker,
              status: "not_found",
              error: "Market not found on Kalshi"
            });
          } else {
            results.errors++;
            results.details.push({
              market_id: marketId,
              ticker,
              status: "api_error",
              error: `Kalshi API error: ${kalshiResponse.status}`
            });
          }
          continue;
        }

        const kalshiData = await kalshiResponse.json();
        const market = kalshiData.market;

        if (!market) {
          results.errors++;
          results.details.push({
            market_id: marketId,
            ticker,
            status: "invalid_response",
            error: "No market data in response"
          });
          continue;
        }

        // Update market metadata in markets table
        try {
          await supabaseAdmin
            .from("markets")
            .upsert({
              market_id: marketId,
              ticker: ticker,
              title: market.title || market.question || null,
              subtitle: market.subtitle || null,
              category: market.category || null,
              status: market.status || null,
              close_ts: market.close_ts || market.close_date ? (typeof market.close_ts === "number" ? market.close_ts : new Date(market.close_date || 0).getTime() / 1000) : null,
              open_interest: market.open_interest || null,
              volume: market.volume || null,
              raw: market as Record<string, unknown>,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "market_id",
              ignoreDuplicates: false
            });
        } catch (marketUpdateErr) {
          // Non-fatal: continue even if market update fails
          console.warn(`[settle/check] Failed to update market metadata for ${ticker} (non-fatal):`, marketUpdateErr);
        }

        // Check if market is settled
        if (market.status !== "settled") {
          // Market exists but not settled yet - status already updated above
          results.skipped++;
          results.details.push({
            market_id: marketId,
            ticker,
            status: market.status || "unknown"
          });
          continue;
        }

        // Determine outcome from settled market
        // In Kalshi, when a market is settled:
        // - yes_price = 100 means YES won
        // - no_price = 100 means NO won
        let outcomeYes: boolean | null = null;

        if (market.yes_price === 100 || market.yes_bid === 100) {
          outcomeYes = true;
        } else if (market.no_price === 100 || market.no_bid === 100) {
          outcomeYes = false;
        } else if (market.outcome !== undefined) {
          // Some markets might have an explicit outcome field
          outcomeYes = market.outcome === "yes" || market.outcome === true;
        } else if (market.result !== undefined) {
          // Alternative field name
          outcomeYes = market.result === "yes" || market.result === true;
        }

        if (outcomeYes === null) {
          results.errors++;
          results.details.push({
            market_id: marketId,
            ticker,
            status: "cannot_determine_outcome",
            error: "Could not determine outcome from market data"
          });
          continue;
        }

        // Call settle endpoint
        const settleUrl = new URL("/api/settle", req.nextUrl.origin).toString();
        let settleResponse: Response;
        try {
          settleResponse = await fetch(settleUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              market_id: marketId,
              outcome_yes: outcomeYes,
              source: "auto_settlement"
            })
          });
        } catch (fetchError) {
          const fetchErrorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
          console.error(`[settle/check] Error calling /api/settle for ${ticker}:`, fetchErrorMsg);
          results.errors++;
          results.details.push({
            market_id: marketId,
            ticker,
            status: "settle_fetch_failed",
            error: `Failed to call settle endpoint: ${fetchErrorMsg}`
          });
          continue;
        }

        if (settleResponse.ok) {
          const _settleData = await settleResponse.json();
          results.settled++;
          results.details.push({
            market_id: marketId,
            ticker,
            status: "settled",
            outcome: outcomeYes
          });
        } else {
          const errorData = await settleResponse.json().catch(() => ({}));
          results.errors++;
          results.details.push({
            market_id: marketId,
            ticker,
            status: "settle_failed",
            error: errorData.message || `Settlement failed: ${settleResponse.status}`
          });
        }

      } catch (error) {
        results.errors++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[settle/check] Error processing market ${ticker || marketId}:`, errorMsg, errorStack);
        results.details.push({
          market_id: marketId || "unknown",
          ticker: ticker || "unknown",
          status: "error",
          error: errorMsg
        });
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        checked: results.checked,
        settled: results.settled,
        skipped: results.skipped,
        errors: results.errors
      },
      details: results.details
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[settle/check] Fatal error:", msg, stack);
    return NextResponse.json({ 
      ok: false, 
      error: "internal_error", 
      message: msg,
      stack: process.env.NODE_ENV === "development" ? stack : undefined
    }, { status: 500 });
  }
}

// GET handler for Vercel cron jobs (cron jobs use GET by default)
export async function GET(req: NextRequest) {
  return handleSettleCheck(req);
}

// POST handler for manual calls
export async function POST(req: NextRequest) {
  return handleSettleCheck(req);
}

