import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { TIER_BADGE_ABI } from "@/lib/nft";

// EIP-712 types for Mint
const MINT_TYPE = {
  Mint: [
    { name: "to", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// EIP-712 types for Upgrade
const UPGRADE_TYPE = {
  Upgrade: [
    { name: "to", type: "address" },
    { name: "burnTokenId", type: "uint256" },
    { name: "newTokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, tokenId, burnTokenId } = body;

    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return NextResponse.json(
        { ok: false, error: "contract_not_configured" },
        { status: 500 }
      );
    }

    // Get chain config
    const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532", 10);
    const chain = chainId === 8453 ? base : baseSepolia;

    // Create public client to read contract
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Read contract name dynamically (must match EIP-712 domain)
    let contractName: string;
    try {
      const nameResult = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: TIER_BADGE_ABI,
        functionName: 'name',
      });
      contractName = nameResult as string;
      console.log("[sign-mint] Contract name from contract:", contractName);
    } catch (err) {
      console.warn("Failed to read contract name, using fallback:", err);
      contractName = process.env.NEXT_PUBLIC_NFT_CONTRACT_NAME || "Base Tier Badge";
    }

    // Query contract for current nonce
    let nonce = BigInt(0);
    try {
      const nonceResult = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: TIER_BADGE_ABI,
        functionName: 'nonces',
        args: [address as `0x${string}`],
      });
      nonce = nonceResult as bigint;
    } catch (err) {
      console.warn("Failed to read nonce from contract, using 0:", err);
      nonce = BigInt(0);
    }

    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const toAddress = address as `0x${string}`;

    // Build domain with contract name (must match EIP712 constructor name_)
    const domain = {
      name: contractName,
      version: "1",
      chainId,
      verifyingContract: contractAddress as `0x${string}`,
    };

    // Check if user has a token (upgrade flow) or needs to mint (new user)
    // If burnTokenId is provided, use upgrade flow
    if (burnTokenId && Number(burnTokenId) > 0) {
      const newTokenId = tokenId || 0; // 0 = auto-assign
      const message = {
        to: toAddress,
        burnTokenId: BigInt(burnTokenId).toString(),
        newTokenId: BigInt(newTokenId).toString(),
        nonce: nonce.toString(),
        deadline: BigInt(deadline).toString(),
      } as const;

      console.log("[sign-mint] Upgrade flow - Domain:", domain);
      console.log("[sign-mint] Upgrade Message:", message);
      console.log("[sign-mint] Nonce:", nonce.toString());

      return NextResponse.json({
        ok: true,
        action: "upgrade",
        to: toAddress,
        burnTokenId: burnTokenId.toString(),
        newTokenId: newTokenId.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        domain,
        types: UPGRADE_TYPE,
        primaryType: "Upgrade" as const,
        message,
      });
    } else {
      // Mint flow (first time)
      const mintTokenId = tokenId || 0; // 0 = auto-assign
      const message = {
        to: toAddress,
        tokenId: BigInt(mintTokenId).toString(),
        nonce: nonce.toString(),
        deadline: BigInt(deadline).toString(),
      } as const;

      console.log("[sign-mint] Mint flow - Domain:", domain);
      console.log("[sign-mint] Mint Message:", message);
      console.log("[sign-mint] Nonce:", nonce.toString());

      return NextResponse.json({
        ok: true,
        action: "mint",
        to: toAddress,
        tokenId: mintTokenId,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        domain,
        types: MINT_TYPE,
        primaryType: "Mint" as const,
        message,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/sign-mint error:", message);
    return NextResponse.json(
      { ok: false, error: "internal_error", message },
      { status: 500 }
    );
  }
}

