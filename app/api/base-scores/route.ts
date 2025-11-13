import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

type Scores = {
  onchain_score?: number;
  unique_days_active?: number;
  longest_streak_days?: number;
  current_streak_days?: number;
  day_activity_period?: number;
  token_swaps?: number;
  bridge_transactions?: number;
  defi_transactions?: number;
  ens_interactions?: number;
  contracts_deployed?: number;
};

function ymd(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function computeStreaks(days: string[]): { longest: number; current: number; period: number } {
  if (days.length === 0) return { longest: 0, current: 0, period: 0 };
  const unique = Array.from(new Set(days)).sort();
  // Activity period (days between first and last inclusive)
  const first = new Date(unique[0] + "T00:00:00Z").getTime();
  const last = new Date(unique[unique.length - 1] + "T00:00:00Z").getTime();
  const period = Math.max(1, Math.round((last - first) / 86400000) + 1);

  // Longest streak
  let longest = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1] + "T00:00:00Z").getTime();
    const cur = new Date(unique[i] + "T00:00:00Z").getTime();
    if (cur - prev === 86400000) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  // Current streak ending today
  let currStreak = 0;
  const today = ymd(new Date());
  let cursor = new Date(today + "T00:00:00Z").getTime();
  for (let i = unique.length - 1; i >= 0; i--) {
    const d = new Date(unique[i] + "T00:00:00Z").getTime();
    if (d === cursor) {
      currStreak++;
      cursor -= 86400000;
    } else if (d < cursor) {
      break;
    }
  }

  return { longest, current: currStreak, period };
}

interface AlchemyTransferParams {
  fromBlock?: string;
  toBlock?: string;
  fromAddress?: string;
  toAddress?: string;
  category?: string[];
  excludeZeroValue?: boolean;
  order?: string;
  maxCount?: string;
  withMetadata?: boolean;
}

interface AlchemyTransfer {
  category?: string;
  metadata?: {
    blockTimestamp?: string;
  };
}

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    const apiKey = process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_BASE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "alchemy_not_configured" }, { status: 500 });
    }

    // Use Base Sepolia for Base Scores
    // Use Sepolia API key
    const sepoliaKey = process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_BASE_API_KEY || apiKey;
    const rpcUrl = `https://base-sepolia.g.alchemy.com/v2/${sepoliaKey}`;
    
    console.log(`[Base Scores] Fetching for address=${address} on Base Sepolia`);

    // Fetch transfers involving the address (both directions), limited window
    // We'll grab up to 1000 recent transfers
    const payload = (params: AlchemyTransferParams) => ({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [params] });
    const [fromRes, toRes] = await Promise.all([
      axios.post(
        rpcUrl,
        payload({
          fromBlock: "0x0",
          toBlock: "latest",
          fromAddress: address,
          category: ["external", "erc20", "erc721", "erc1155"],
          excludeZeroValue: false,
          order: "desc",
          maxCount: "0x3e8",
          withMetadata: true,
        }),
        { timeout: 20000 }
      ),
      axios.post(
        rpcUrl,
        payload({
          fromBlock: "0x0",
          toBlock: "latest",
          toAddress: address,
          category: ["external", "erc20", "erc721", "erc1155"],
          excludeZeroValue: false,
          order: "desc",
          maxCount: "0x3e8",
          withMetadata: true,
        }),
        { timeout: 20000 }
      ),
    ]);

    const fromTransfers: AlchemyTransfer[] = (fromRes.data?.result?.transfers || []);
    const toTransfers: AlchemyTransfer[] = (toRes.data?.result?.transfers || []);
    console.log(`[Base Scores] Transfers found: from=${fromTransfers.length}, to=${toTransfers.length}`);
    if (fromTransfers.length === 0 && toTransfers.length === 0) {
      // Fallback: try a narrower query (erc20 only) just to confirm connectivity
      try {
        const [f2, t2] = await Promise.all([
          axios.post(rpcUrl, payload({ fromBlock: "0x0", toBlock: "latest", fromAddress: address, category: ["erc20"], order: "desc", maxCount: "0x3e8", withMetadata: true }), { timeout: 20000 }),
          axios.post(rpcUrl, payload({ fromBlock: "0x0", toBlock: "latest", toAddress: address, category: ["erc20"], order: "desc", maxCount: "0x3e8", withMetadata: true }), { timeout: 20000 }),
        ]);
        const ft = (f2.data?.result?.transfers || []).length;
        const tt = (t2.data?.result?.transfers || []).length;
        console.log(`[base-scores] fallback erc20 only from=${ft} to=${tt}`);
      } catch (e) {
        console.log('[base-scores] fallback error', e);
      }
    }
    const transfers = [...fromTransfers, ...toTransfers];
    const dayKeys: string[] = [];
    let erc20Count = 0;
    for (const t of transfers) {
      if (t.category === "erc20") erc20Count++;
      const dt = t.metadata?.blockTimestamp ? new Date(t.metadata.blockTimestamp) : undefined;
      if (dt) dayKeys.push(ymd(dt));
    }
    console.log(`[base-scores] collected days=${dayKeys.length} (unique=${new Set(dayKeys).size}) erc20=${erc20Count}`);

    const stats = computeStreaks(dayKeys);
    const scores: Scores = {
      unique_days_active: new Set(dayKeys).size,
      longest_streak_days: stats.longest,
      current_streak_days: stats.current,
      day_activity_period: stats.period,
      token_swaps: erc20Count,
      bridge_transactions: 0,
      defi_transactions: 0,
      ens_interactions: 0,
      contracts_deployed: 0,
    };
    console.log(`[base-scores] computed`, scores);

    return NextResponse.json({ ok: true, scores });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Surface error details to help diagnose (e.g., BigInt serialization)
    console.error("/api/base-scores error:", message, e);
    return NextResponse.json({ ok: false, error: "internal_error", message }, { status: 500 });
  }
}


