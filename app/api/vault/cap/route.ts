import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const user = (url.searchParams.get("user") || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(user)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    const vaultAddr = (process.env.NEXT_PUBLIC_FORECAST_VAULT_ADDRESS || process.env.FORECAST_VAULT_ADDRESS || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(vaultAddr)) {
      return NextResponse.json({ ok: false, error: "vault_not_configured" }, { status: 501 });
    }

    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
    const apiKey = process.env.ALCHEMY_API_KEY;
    const rpcUrl = chainId === 8453
      ? (apiKey ? `https://base-mainnet.g.alchemy.com/v2/${apiKey}` : undefined)
      : (apiKey ? `https://base-sepolia.g.alchemy.com/v2/${apiKey}` : undefined);
    const client = createPublicClient({ chain: chainId === 8453 ? base : baseSepolia, transport: http(rpcUrl) });

    const erc20Abi = [
      { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
      { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
    ] as const;

    const [shares, decimals] = await Promise.all([
      client.readContract({ address: vaultAddr as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [user as `0x${string}`] }) as Promise<bigint>,
      client.readContract({ address: vaultAddr as `0x${string}`, abi: erc20Abi, functionName: 'decimals' }) as Promise<number>,
    ]);

    const pointsPerUsdc = Number(process.env.POINTS_PER_USDC || '1');
    const sharesFloat = Number(shares) / Math.pow(10, decimals);
    const cap = Math.floor(sharesFloat * pointsPerUsdc);

    return NextResponse.json({ ok: true, cap, shares: shares.toString(), decimals, pointsPerUsdc });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

