import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { supabaseAdmin } from "@/lib/db";

// ERC721 ABI for ownerOf
const ERC721_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tokenId = parseInt(id, 10);

    if (isNaN(tokenId) || tokenId <= 0) {
      return NextResponse.json({ error: "Invalid token ID" }, { status: 400 });
    }

    const contractAddress = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS;
    if (!contractAddress) {
      return NextResponse.json({ error: "Contract not configured" }, { status: 500 });
    }

    // Get chain config
    const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
    const chain = chainId === "8453" ? base : baseSepolia;

    // Create public client to read from contract
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    try {
      // Get token owner from contract (confirms token exists)
      const owner = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });

      // 1) Prefer minted snapshot stored in Supabase (frozen at mint)
      if (supabaseAdmin) {
        try {
          const { data: minted } = await supabaseAdmin
            .from("eligibility")
            .select("minted_metadata_url")
            .eq("minted_token_id", tokenId)
            .maybeSingle();

          const mintedUrl = minted?.minted_metadata_url as string | null | undefined;
          if (mintedUrl) {
            let url = mintedUrl;
            if (url.startsWith('ipfs://')) {
              url = url.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
            }
            const mintedRes = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (mintedRes.ok) {
              const metadata = await mintedRes.json();
              return NextResponse.json(metadata, {
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'public, max-age=86400',
                },
              });
            }
          }
        } catch (e) {
          console.log('[metadata] Supabase minted lookup failed, falling back:', e);
        }
      }

      // Try to get tokenURI to fetch stored metadata from IPFS first
      let storedMetadata = null;
      try {
        const tokenURI = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: [...ERC721_ABI, {
            inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
            name: 'tokenURI',
            outputs: [{ internalType: 'string', name: '', type: 'string' }],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        });

        // If tokenURI is an IPFS URL, try to fetch the stored metadata
        if (tokenURI && (tokenURI.startsWith('https://gateway.pinata.cloud/ipfs/') || 
            tokenURI.startsWith('ipfs://') || 
            tokenURI.startsWith('https://ipfs.io/ipfs/') ||
            tokenURI.includes('/ipfs/'))) {
          try {
            let ipfsUrl = tokenURI;
            if (tokenURI.startsWith('ipfs://')) {
              ipfsUrl = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
            }
            
            const ipfsResponse = await fetch(ipfsUrl, {
              headers: { 'Accept': 'application/json' },
            });
            
            if (ipfsResponse.ok) {
              storedMetadata = await ipfsResponse.json();
              console.log(`Using stored IPFS metadata for token ${tokenId}`);
              // Return the stored metadata directly
              return NextResponse.json(storedMetadata, {
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'public, max-age=3600',
                },
              });
            }
          } catch (ipfsError) {
            console.log('Could not fetch from IPFS, will use current stats:', ipfsError);
          }
        }
      } catch {
        console.log('Could not get tokenURI, will use current stats');
      }

      // Fallback: Fetch current stats for the owner (for backwards compatibility or if IPFS fails)
      const statsResponse = await fetch(
        `${req.nextUrl.origin}/api/stats?address=${owner.toLowerCase()}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!statsResponse.ok) {
        // If stats fetch fails, return basic metadata
        return NextResponse.json({
          name: `Base Tier Badge #${tokenId}`,
          description: `Tier Badge NFT token #${tokenId}`,
          image: `${req.nextUrl.origin}/images/default.png`,
          attributes: [
            { trait_type: 'Token ID', value: tokenId },
          ],
        });
      }

      const statsData = await statsResponse.json();
      if (!statsData.ok) {
        return NextResponse.json({
          name: `Base Tier Badge #${tokenId}`,
          description: `Tier Badge NFT token #${tokenId}`,
          image: `${req.nextUrl.origin}/images/default.png`,
          attributes: [
            { trait_type: 'Token ID', value: tokenId },
          ],
        });
      }

      const { tier, animal, stats } = statsData;

      // Return metadata JSON
      const attributes = [
        { trait_type: 'Tier', value: tier },
        { trait_type: 'Animal', value: animal },
        { trait_type: 'Token ID', value: tokenId },
        { trait_type: 'Transactions', value: stats.tx_count },
        { trait_type: 'Unique Peers', value: stats.unique_peers },
        { trait_type: 'ERC-20 Count', value: stats.erc20_count },
        { trait_type: 'NFT Collections', value: stats.nft_collections },
        { trait_type: 'NFT Count', value: stats.nft_count },
      ];
      
      // Add basename if present
      if (stats.has_basename && stats.basename) {
        attributes.push({ trait_type: 'Basename', value: stats.basename });
      }
      
      const metadata = {
        name: `${animal} - Tier ${tier} #${tokenId}`,
        description: `On-chain stats NFT for ${owner.slice(0, 6)}...${owner.slice(-4)}. Transactions: ${stats.tx_count}, Unique Peers: ${stats.unique_peers}, ERC-20s: ${stats.erc20_count}, NFTs: ${stats.nft_count}`,
        image: `${req.nextUrl.origin}/api/image/${tokenId}.png`,
        external_url: `https://base.org`,
        attributes,
      };

      return NextResponse.json(metadata, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    } catch {
      // If contract read fails (token doesn't exist), return 404
      return NextResponse.json(
        { error: "Token not found" },
        { status: 404 }
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/metadata/[id] error:", message);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}

