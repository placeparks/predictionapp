import { NextRequest, NextResponse } from "next/server";
import { Alchemy, Network } from "alchemy-sdk";
import { supabaseAdmin } from "@/lib/db";
import { computeTier, animalFor } from "@/lib/tier";

interface AssetTransfer {
  hash?: string;
  logIndex?: number;
  category?: string;
  from?: string;
  to?: string;
  [key: string]: unknown;
}


interface AlchemyConfig {
  apiKey: string;
  network: Network;
  url: string;
}

interface TokenBalance {
  tokenBalance?: string;
  balance?: string;
  contractAddress?: string;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").toLowerCase();

  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
  }
  // 2) Live fetch
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "missing_alchemy_api_key" }, { status: 500 });
  }

  // Pick network from CHAIN_ID (8453 main, 84532 sepolia)
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
  const network = chainId === 8453 ? Network.BASE_MAINNET : Network.BASE_SEPOLIA;

  // Build Alchemy API URL directly (bypasses SDK's referrer header issue)
  const alchemyUrl = network === Network.BASE_MAINNET
    ? `https://base-mainnet.g.alchemy.com/v2/${apiKey}`
    : `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
  
  // Log network for debugging
  console.log(`[Stats API] Using network: ${network === Network.BASE_MAINNET ? 'Base Mainnet' : 'Base Sepolia'} (Chain ID: ${chainId})`);
  console.log(`[Stats API] Alchemy URL: ${alchemyUrl.replace(apiKey, '***')}`);

  // Direct RPC client to avoid SDK referrer header issues
  async function alchemyRpc(method: string, params: unknown[]): Promise<unknown> {
    // Log RPC calls for debugging (first call only to avoid spam)
    if (method === 'alchemy_getAssetTransfers' && params[0] && typeof params[0] === 'object' && 'fromAddress' in params[0] && typeof params[0].fromAddress === 'string') {
      console.log(`[Stats API] RPC call to ${alchemyUrl.includes('mainnet') ? 'MAINNET' : 'SEPOLIA'}: ${method} for ${params[0].fromAddress.slice(0, 10)}...`);
    }
    
    const response = await fetch(alchemyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Alchemy RPC failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.error) {
      throw new Error(`Alchemy RPC error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    return data.result;
  }

  // Use SDK for NFT calls (they work fine)
  // Configure Alchemy SDK with explicit URL to ensure correct network
  const alchemySdkUrl = network === Network.BASE_MAINNET
    ? `https://base-mainnet.g.alchemy.com/v2/${apiKey}`
    : `https://base-sepolia.g.alchemy.com/v2/${apiKey}`;
  
  const alchemy = new Alchemy({ 
    apiKey, 
    network,
    // Explicitly set URL to ensure correct endpoint (fixes SDK referrer issues too)
    url: alchemySdkUrl
  } as AlchemyConfig);
  
  console.log(`[Stats API] Alchemy SDK configured for: ${network === Network.BASE_MAINNET ? 'Base Mainnet' : 'Base Sepolia'}`);

  // ---- helpers with pagination ----
  const cat = ["external", "erc20", "erc721", "erc1155"] as const;

  async function fetchTransfersDir(opts: { fromAddress?: string; toAddress?: string }, retries = 3) {
    const transfers: AssetTransfer[] = [];
    let pageKey: string | undefined = undefined;
    let attempt = 0;

    do {
      attempt++;
      let lastError: Error | null = null;
      
      // Retry logic with exponential backoff
      // On Base Sepolia, try without fromBlock first (faster), only add it on retry
      let useFromBlock = network !== Network.BASE_SEPOLIA || attempt > 1 || !!pageKey;
      
      for (let retry = 0; retry < retries; retry++) {
        try {
          const params: Record<string, unknown> = {
            ...opts,
            category: cat,
            withMetadata: false,
            excludeZeroValue: false,
            pageKey,
            maxCount: "0x3e8", // 1000 in hex (required by Alchemy RPC)
          };
          
          // Only use fromBlock if it's not the first attempt on Base Sepolia
          if (useFromBlock) {
            params.fromBlock = "0x0";
            params.toBlock = "latest";
          }
          
          // Use direct RPC call to avoid SDK referrer header issues
          const rpcParams = [params] as unknown[];
          const r = await alchemyRpc('alchemy_getAssetTransfers', rpcParams) as { transfers?: AssetTransfer[]; pageKey?: string };
          
          if (r && r.transfers) {
            transfers.push(...r.transfers);
          }
          pageKey = r?.pageKey;
          lastError = null;
          break; // Success, exit retry loop
          
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const errorMsg = lastError.message || String(err);
          console.warn(`getAssetTransfers attempt ${retry + 1}/${retries} failed:`, errorMsg);
          
          // If failed with fromBlock, try without it on Base Sepolia
          if (useFromBlock && network === Network.BASE_SEPOLIA && retry === 0) {
            console.log("Retrying without fromBlock on Base Sepolia...");
            useFromBlock = false;
            continue; // Retry immediately without fromBlock
          }
          
          if (retry < retries - 1) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, retry) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // If still failed after all retries, log and continue (return partial results)
      if (lastError && !pageKey && transfers.length === 0) {
        console.error(`getAssetTransfers failed after all retries for ${opts.fromAddress ? 'fromAddress' : 'toAddress'}:`, lastError);
        // Don't break - return what we have (might be empty, but that's ok)
      }
      
      // Small delay between pages to avoid rate limiting
      if (pageKey) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } while (pageKey);

    return transfers;
  }

  async function fetchAllTransfers(addr: string) {
    // Fetch sequentially with delay to avoid rate limiting
    let from: AssetTransfer[] = [];
    let to: AssetTransfer[] = [];
    
    try {
      from = await fetchTransfersDir({ fromAddress: addr });
    } catch (err) {
      console.warn("Failed to fetch from transfers:", err);
    }
    
    // Small delay between from/to requests
    await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      to = await fetchTransfersDir({ toAddress: addr });
    } catch (err) {
      console.warn("Failed to fetch to transfers:", err);
    }
    
    // Deduplicate by hash+logIndex to avoid counting same transfer twice
    const transferMap = new Map<string, AssetTransfer>();
    for (const t of [...from, ...to]) {
      const key = `${t.hash || ''}_${t.logIndex || 0}_${t.category || ''}`;
      if (!transferMap.has(key)) {
        transferMap.set(key, t);
      }
    }
    
    return Array.from(transferMap.values());
  }

  async function fetchAllNfts(addr: string) {
    const owned: Array<{ contract?: { address?: string }; [key: string]: unknown }> = [];
    let pageKey: string | undefined = undefined;

    do {
      const r = await alchemy.nft.getNftsForOwner(addr, {
        omitMetadata: true,
        pageKey,
      }) as unknown as { ownedNfts?: Array<{ contract?: { address?: string }; [key: string]: unknown }>; pageKey?: string };
      owned.push(...(r.ownedNfts || []).map((nft: { contract?: { address?: string }; [key: string]: unknown }) => ({
        contract: { address: nft.contract?.address },
        ...nft,
      })));
      pageKey = r.pageKey;
    } while (pageKey);

    const collections = new Set(
      owned.map((n) => (n.contract?.address || "").toLowerCase()).filter(Boolean)
    );

    return { nft_count: owned.length, nft_collections: collections.size };
  }

  try {
    // Transfers (both directions, paginated)
    let allTransfers: AssetTransfer[] = [];
    let tx_count = 0;
    const uniqueTxHashes = new Set<string>();

    try {
      allTransfers = await fetchAllTransfers(address);
      for (const transfer of allTransfers) {
        const hash = typeof transfer.hash === "string" ? transfer.hash.toLowerCase() : "";
        if (hash) uniqueTxHashes.add(hash);
      }
      tx_count = uniqueTxHashes.size;
      console.log(`[Stats API] Fetched ${allTransfers.length} transfers and ${tx_count} unique tx hashes for ${address}`);
    } catch (transferErr) {
      console.error("Failed to fetch transfers:", transferErr);
      // Continue with empty transfers, don't fail entire request
    }

    // Complement transfer-derived count with nonce (eth_getTransactionCount) per Alchemy docs
    try {
      const nonceHex = await alchemyRpc("eth_getTransactionCount", [address, "latest"]);
      if (typeof nonceHex === "string") {
        const outgoingTxs = Number.parseInt(nonceHex, 16);
        if (Number.isFinite(outgoingTxs)) {
          tx_count = Math.max(tx_count, outgoingTxs);
        }
      }
    } catch (nonceErr) {
      console.warn("eth_getTransactionCount failed:", nonceErr);
    }

    // Unique peers
    const peers = new Set<string>();
    for (const t of allTransfers) {
      const f = (t.from || "").toLowerCase();
      const to = (t.to || "").toLowerCase();
      if (f && f !== address) peers.add(f);
      if (to && to !== address) peers.add(to);
    }
    const unique_peers = peers.size;

    // ERC20 balances (non-zero) - get ALL tokens using multiple methods
    let erc20_count = 0;
    try {
      console.log(`[Stats API] Fetching ALL token balances for ${address}...`);
      
      // Strategy: Try multiple methods to get all ERC20 tokens
      // 1. Try RPC with 'erc20' (gets all ERC20 tokens)
      // 2. Try SDK with 'erc20' option
      // 3. Fallback to DEFAULT_TOKENS (limited set)
      
      try {
        // Method 1: Try RPC with 'erc20' to get ALL ERC20 tokens
        try {
          const result = await alchemyRpc('alchemy_getTokenBalances', [address, 'erc20'] as unknown[]) as { tokenBalances?: TokenBalance[] };
          const tokenBalances = result?.tokenBalances || [];
          
          erc20_count = tokenBalances.filter(
            (b: TokenBalance) => {
              // Check for non-zero balance and ensure it's a valid token address
              const balance = b.tokenBalance || b.balance || "0x0";
              const tokenAddress = b.contractAddress;
              // Filter out null/empty addresses, zero address, and zero balances
              return tokenAddress && 
                     tokenAddress !== "0x0000000000000000000000000000000000000000" && 
                     tokenAddress !== null &&
                     balance && 
                     balance !== "0x0" && 
                     balance !== "0";
            }
          ).length;
          console.log(`[Stats API] Fetched ${erc20_count} ERC20 tokens with non-zero balances using RPC 'erc20' (total: ${tokenBalances.length})`);
        } catch (rpcErr) {
          // RPC method failed, will try SDK next
          throw rpcErr;
        }
      } catch (e1) {
        const errorMsg = e1 instanceof Error ? e1.message : String(e1);
        console.warn("RPC getTokenBalances with 'erc20' failed, trying SDK:", errorMsg);
        // Method 2: Try SDK with 'erc20' option
        try {
          // SDK might accept 'erc20' as a category string
          const tokenBalancesResult = await alchemy.core.getTokenBalances(address, 'erc20' as unknown as string[]);
          const tokenBalances = tokenBalancesResult.tokenBalances || [];
          
          erc20_count = tokenBalances.filter(
            (b): boolean => {
              // Type guard for token balance with contract address
              const tokenBalance = b as unknown as TokenBalance;
              const balance = tokenBalance.tokenBalance || tokenBalance.balance || "0x0";
              const tokenAddress = tokenBalance.contractAddress;
              return !!(
                tokenAddress && 
                tokenAddress !== "0x0000000000000000000000000000000000000000" && 
                tokenAddress !== null &&
                balance && 
                balance !== "0x0" && 
                balance !== "0"
              );
            }
          ).length;
          console.log(`[Stats API] Fetched ${erc20_count} ERC20 tokens with non-zero balances using SDK 'erc20' (total: ${tokenBalances.length})`);
        } catch (e2) {
          const errorMsg2 = e2 instanceof Error ? e2.message : String(e2);
          console.warn("SDK getTokenBalances with 'erc20' failed, trying DEFAULT_TOKENS:", errorMsg2);
          // Method 3: Fallback to DEFAULT_TOKENS (limited set but better than nothing)
          try {
            const result = await alchemyRpc('alchemy_getTokenBalances', [address, 'DEFAULT_TOKENS'] as unknown[]) as { tokenBalances?: TokenBalance[] };
            const tokenBalances = result?.tokenBalances || [];
            erc20_count = tokenBalances.filter(
              (b: TokenBalance) => {
                const balance = b.tokenBalance || b.balance || "0x0";
                return balance && balance !== "0x0" && balance !== "0";
              }
            ).length;
            console.log(`[Stats API] Fetched ${erc20_count} ERC20 tokens with non-zero balances (DEFAULT_TOKENS fallback)`);
          } catch (e3) {
            const errorMsg3 = e3 instanceof Error ? e3.message : String(e3);
            console.warn("All token balance methods failed, using count 0:", errorMsg3);
            erc20_count = 0;
          }
        }
      }
    } catch (e) {
      console.warn("getTokenBalances failed completely:", e);
    }

    // NFTs (paginated)
    let nft_count = 0;
    let nft_collections = 0;
    try {
      const nftStats = await fetchAllNfts(address);
      nft_count = nftStats.nft_count;
      nft_collections = nftStats.nft_collections;
    } catch (e) {
      console.warn("getNftsForOwner failed:", e);
    }

    // Base name check - reverse lookup using Base Name Service
    let basename: string | undefined = undefined;
    let has_basename = false;
    try {
      // Try Base Name Service reverse resolution via @coinbase/onchainkit
      // ALWAYS check Base mainnet (8453) for basename, even if app is on Sepolia
      {
        try {
          const { getName } = await import('@coinbase/onchainkit/identity');
          const { base } = await import('viem/chains');
          
          console.log(`[Stats API] Resolving basename for ${address}...`);
          const name = await getName({ address: address as `0x${string}`, chain: base });
          
          if (name) {
            basename = name;
            has_basename = true;
            console.log(`[Stats API] Found Base name via OnchainKit: ${basename}`);
          } else {
            console.log(`[Stats API] No basename found for ${address}`);
          }
        } catch (err) {
          console.log(`[Stats API] Basename lookup failed:`, err);
          has_basename = false;
          basename = undefined;
        }
      }
    } catch (basenameError) {
      console.warn("[Stats API] Base name check failed:", basenameError);
      has_basename = false;
      basename = undefined;
    }
    const erc20_usd = 0;

    const snapshot = {
      address,
      chain: chainId === 8453 ? "base" : "base-sepolia",
      tx_count,
      unique_peers,
      erc20_count,
      erc20_usd,
      nft_collections,
      nft_count,
      has_basename,
      basename: basename || undefined,
      last_indexed_at: new Date().toISOString(),
    };

    const tier = computeTier(snapshot);

    // Get minted tier from Supabase if available
    let mintedTier = null;
    let mintedAnimal = null;
    let mintedTokenId = null;
    let mintedMetadataUrl = null;
    let mintedAt = null;
    
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("wallet_stats").upsert(snapshot, { onConflict: "address" });
        
        // Try to get existing eligibility record to preserve minted data
        const { data: existingEligibility, error: eligibilityError } = await supabaseAdmin
          .from("eligibility")
          .select("*")
          .eq("address", address.toLowerCase())
          .maybeSingle();
        
        if (eligibilityError) {
          console.warn("[Stats API] Error fetching eligibility:", eligibilityError);
        }
        
        // Preserve minted data if it exists
        interface EligibilityUpdate {
          address: string;
          tier: number;
          next_tier: number;
          last_computed_at: string;
          minted_tier?: number | null;
          minted_animal?: string | null;
          minted_token_id?: number | null;
          minted_metadata_url?: string | null;
          minted_at?: string | null;
        }
        const eligibilityUpdate: EligibilityUpdate = {
          address,
          tier,
          next_tier: Math.min(tier + 1, 5),
          last_computed_at: new Date().toISOString(),
        };
        
        if (existingEligibility) {
          // Preserve minted data
          if (existingEligibility.minted_tier !== null && existingEligibility.minted_tier !== undefined) {
            eligibilityUpdate.minted_tier = existingEligibility.minted_tier;
            eligibilityUpdate.minted_animal = existingEligibility.minted_animal;
            eligibilityUpdate.minted_token_id = existingEligibility.minted_token_id;
            eligibilityUpdate.minted_metadata_url = existingEligibility.minted_metadata_url;
            eligibilityUpdate.minted_at = existingEligibility.minted_at;
            mintedTier = existingEligibility.minted_tier;
            mintedAnimal = existingEligibility.minted_animal || null;
            mintedTokenId = existingEligibility.minted_token_id;
            mintedMetadataUrl = existingEligibility.minted_metadata_url || null;
            mintedAt = existingEligibility.minted_at || null;
            
            console.log(`[Stats API] Found minted NFT for ${address}: Tier ${mintedTier} ${mintedAnimal}, Token ID ${mintedTokenId}`);
          }
        }
        
        await supabaseAdmin
          .from("eligibility")
          .upsert(eligibilityUpdate, { onConflict: "address" });
      } catch (e) {
        console.warn("[Stats API] Supabase upsert failed", e);
      }
    }

    return NextResponse.json({
      ok: true,
      address,
      stats: {
        ...snapshot,
        basename: basename || undefined,
      },
      tier,
      animal: animalFor(tier),
      minted_tier: mintedTier,
      minted_animal: mintedAnimal,
      minted_token_id: mintedTokenId,
      minted_metadata_url: mintedMetadataUrl,
      minted_at: mintedAt,
      cached: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Live fetch failed:", message);

    // Safe fallback
    const fallback = {
      address,
      chain: chainId === 8453 ? "base" : "base-sepolia",
      tx_count: 0,
      unique_peers: 0,
      erc20_count: 0,
      erc20_usd: 0,
      nft_collections: 0,
      nft_count: 0,
      has_basename: false,
      basename: undefined,
      last_indexed_at: new Date().toISOString(),
    };
    const tier = computeTier(fallback);
    return NextResponse.json({ ok: true, address, stats: fallback, tier, animal: animalFor(tier), cached: false });
  }
}