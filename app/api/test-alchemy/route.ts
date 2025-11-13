// Test endpoint for Alchemy API provider
import { NextRequest, NextResponse } from "next/server";
import { AlchemyProvider } from "../base-daily/providers";
import { supabaseAdmin } from "@/lib/db";

interface TestResult {
  success: boolean;
  data?: unknown;
  error?: string;
  source?: string;
  message?: string;
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.ALCHEMY_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        error: "ALCHEMY_API_KEY not configured",
        message: "Please set ALCHEMY_API_KEY in your environment variables"
      }, { status: 500 });
    }

    const provider = new AlchemyProvider(apiKey);
    
    // Allow date to be specified via query param, default to today
    const searchParams = req.nextUrl.searchParams;
    const testDate = searchParams.get("date") || new Date().toISOString().split('T')[0];
    
    // Get or calculate block numbers for this date (using saved blocks if available)
    const date = new Date(`${testDate}T00:00:00Z`);
    const startTimestamp = Math.floor(date.getTime() / 1000);
    const endTimestamp = startTimestamp + 86400;
    
    // Check for saved blocks in database
    const sessionId = testDate; // Use date as session ID for lookup
    let startBlock: number | null = null;
    let endBlock: number | null = null;

    if (supabaseAdmin) {
      const { data: sessionData } = await supabaseAdmin
        .from("base_daily_sessions")
        .select("start_block, end_block")
        .eq("session_id", sessionId)
        .maybeSingle();

      startBlock = sessionData?.start_block ?? null;
      endBlock = sessionData?.end_block ?? null;
    }

    // If no saved blocks, calculate and save them
    if (!startBlock || !endBlock) {
      console.log(`[test-alchemy] No saved blocks for ${testDate}, calculating...`);
      const blockRangeResult = await provider.getBlockRangeForDate(
        startTimestamp,
        endTimestamp
      );

      if (blockRangeResult.success && blockRangeResult.data) {
        startBlock = blockRangeResult.data.startBlock;
        endBlock = blockRangeResult.data.endBlock;
        
        // Save blocks to session if supabaseAdmin is available
        if (supabaseAdmin) {
          await supabaseAdmin
            .from("base_daily_sessions")
            .upsert({
              session_id: sessionId,
              start_block: startBlock,
              end_block: endBlock,
              phase: "settled",
              open_at: new Date(startTimestamp * 1000).toISOString(),
              lock_at: new Date(endTimestamp * 1000).toISOString(),
              resolve_at: new Date(endTimestamp * 1000).toISOString(),
              metrics: {},
            }, {
              onConflict: "session_id",
            });

          console.log(`[test-alchemy] Saved block range for ${testDate}: ${startBlock} - ${endBlock}`);
        }
      } else {
        console.warn(`[test-alchemy] Failed to get block range: ${blockRangeResult.error}`);
      }
    } else {
      console.log(`[test-alchemy] Using saved blocks for ${testDate}: ${startBlock} - ${endBlock}`);
    }

    const tests: Record<string, TestResult> = {};

    // Test 1: Transaction Count (with saved blocks)
    try {
      const txResult = await provider.getDailyTransactionCount(testDate, startBlock, endBlock);
      tests.transactionCount = {
        success: txResult.success,
        data: txResult.data,
        error: txResult.error,
        source: txResult.source
      };
    } catch (e) {
      tests.transactionCount = {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    // Test 2: Active Addresses (with saved blocks)
    try {
      const addrResult = await provider.getDailyNewAddresses(testDate, startBlock, endBlock);
      tests.activeAddresses = {
        success: addrResult.success,
        data: addrResult.data,
        error: addrResult.error,
        source: addrResult.source
      };
    } catch (e) {
      tests.activeAddresses = {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    // Test 3: Gas Price (with saved blocks)
    try {
      const gasResult = await provider.getDailyAvgGasPrice(testDate, startBlock, endBlock);
      tests.avgGasPrice = {
        success: gasResult.success,
        data: gasResult.data,
        error: gasResult.error,
        source: gasResult.source
      };
    } catch (e) {
      tests.avgGasPrice = {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    // Test 4: New Contracts (with saved blocks)
    try {
      const contractResult = await provider.getDailyNewContracts(testDate, startBlock, endBlock);
      tests.newContracts = {
        success: contractResult.success,
        data: contractResult.data,
        error: contractResult.error,
        source: contractResult.source
      };
    } catch (e) {
      tests.newContracts = {
        success: false,
        error: e instanceof Error ? e.message : String(e)
      };
    }

    // Test 5: Basic RPC connection test (via transaction count which uses eth_blockNumber internally)
    // If transaction count works, RPC connection is working
    const rpcWorking = tests.transactionCount?.success === true;
    
    tests.rpcConnection = {
      success: rpcWorking,
      message: rpcWorking ? "RPC connection verified via transaction count test" : "RPC connection failed - check transaction count test for details"
    };

    const allTestsPassed = Object.values(tests).every((test) => test.success === true);

    const results = {
      ok: allTestsPassed,
      apiKeyConfigured: true,
      apiKeyLength: apiKey.length,
      testDate,
      blockRange: startBlock && endBlock ? { startBlock, endBlock } : null,
      tests
    };

    return NextResponse.json(results, { status: allTestsPassed ? 200 : 500 });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      error: "test_failed",
      message: msg
    }, { status: 500 });
  }
}
