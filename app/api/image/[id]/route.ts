import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { generateNFTImage } from "@/lib/imageGenerator";
import { supabaseAdmin } from "@/lib/db";
import type { Snapshot } from "@/lib/tier";

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
              // If metadata has an image URL, try to fetch and proxy it
              const imageUrl: string | undefined = metadata?.image;
              if (imageUrl && typeof imageUrl === 'string') {
                let resolvedImage = imageUrl;
                if (resolvedImage.startsWith('ipfs://')) {
                  resolvedImage = resolvedImage.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
                }
                try {
                  const imgRes = await fetch(resolvedImage);
                  if (imgRes.ok) {
                    const arrayBuf = await imgRes.arrayBuffer();
                    return new NextResponse(Buffer.from(arrayBuf) as unknown as BodyInit, {
                      headers: {
                        'Content-Type': imgRes.headers.get('content-type') || 'image/png',
                        'Cache-Control': 'public, max-age=86400',
                      },
                    });
                  }
                } catch (e) {
                  console.log('[image] Failed to proxy IPFS image, will try to regenerate:', e);
                }

                // If we couldn't fetch the image directly, try to regenerate from attributes
                if (Array.isArray(metadata?.attributes)) {
                  interface Attribute {
                    trait_type?: string;
                    value?: unknown;
                  }
                  const attrs = (metadata.attributes as Attribute[]).reduce((acc: Record<string, unknown>, attr: Attribute) => {
                    if (attr.trait_type) {
                      acc[attr.trait_type] = attr.value;
                    }
                    return acc;
                  }, {});
                  const tier = Number(attrs['Tier'] ?? 0);
                  const animal = String(attrs['Animal'] ?? 'Tadpole');
                  const basename = attrs['Basename'] !== undefined ? String(attrs['Basename']) : undefined;
                  const stats: Snapshot = {
                    tx_count: Number(attrs['Transactions'] ?? 0),
                    unique_peers: Number(attrs['Unique Peers'] ?? 0),
                    erc20_count: Number(attrs['ERC-20 Count'] ?? 0),
                    nft_collections: Number(attrs['NFT Collections'] ?? 0),
                    nft_count: Number(attrs['NFT Count'] ?? 0),
                    erc20_usd: 0,
                    has_basename: !!basename,
                    basename: basename,
                  };
                  const imageBuffer = await generateNFTImage({ tier, animal, stats, address: owner.toLowerCase() });
                  return new NextResponse(imageBuffer as unknown as BodyInit, {
                    headers: {
                      'Content-Type': 'image/png',
                      'Cache-Control': 'public, max-age=86400',
                    },
                  });
                }
              }
            }
          }
        } catch (e) {
          console.log('[image] Supabase minted lookup failed, falling back:', e);
        }
      }

      // Try to get tokenURI to fetch stored metadata from IPFS
      let storedStats = null;
      let storedTier = null;
      let storedAnimal = null;
      
      try {
        // Check if we can get tokenURI (need to add tokenURI to ABI)
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
        
        // If tokenURI is an IPFS URL, try to fetch the metadata
        if (tokenURI && (tokenURI.startsWith('https://gateway.pinata.cloud/ipfs/') || 
            tokenURI.startsWith('ipfs://') || 
            tokenURI.startsWith('https://ipfs.io/ipfs/') ||
            tokenURI.includes('/ipfs/'))) {
          try {
            // Convert ipfs:// to https://gateway format
            let ipfsUrl = tokenURI;
            if (tokenURI.startsWith('ipfs://')) {
              ipfsUrl = tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
            } else if (tokenURI.includes('/ipfs/')) {
              // Already in gateway format
              ipfsUrl = tokenURI;
            }
            
            const metadataResponse = await fetch(ipfsUrl, {
              headers: {
                'Accept': 'application/json',
              },
            });
            
            if (metadataResponse.ok) {
              interface MetadataAttribute {
                trait_type?: string;
                value?: unknown;
              }
              interface Metadata {
                attributes?: MetadataAttribute[];
                image?: string;
              }
              const metadata = await metadataResponse.json() as Metadata;
              // Extract stats from stored metadata attributes
              if (metadata.attributes && Array.isArray(metadata.attributes)) {
                const attrs = metadata.attributes.reduce((acc: Record<string, unknown>, attr: MetadataAttribute) => {
                  if (attr.trait_type) {
                    acc[attr.trait_type] = attr.value;
                  }
                  return acc;
                }, {});
                storedTier = attrs['Tier'] as number | null;
                storedAnimal = attrs['Animal'] as string | null;
                // Extract stats, but don't default to 0 - preserve undefined to detect missing values
                const txCount = attrs['Transactions'] !== undefined ? Number(attrs['Transactions']) : undefined;
                const nftCount = attrs['NFT Count'] !== undefined ? Number(attrs['NFT Count']) : undefined;
                const basename = attrs['Basename'] !== undefined ? String(attrs['Basename']) : undefined;
                
                storedStats = {
                  tx_count: txCount ?? 0,
                  unique_peers: (attrs['Unique Peers'] !== undefined ? Number(attrs['Unique Peers']) : 0),
                  erc20_count: (attrs['ERC-20 Count'] !== undefined ? Number(attrs['ERC-20 Count']) : 0),
                  nft_collections: (attrs['NFT Collections'] !== undefined ? Number(attrs['NFT Collections']) : 0),
                  nft_count: nftCount ?? 0,
                  erc20_usd: 0,
                  has_basename: !!basename,
                  basename: basename,
                };
                
                console.log(`[image/${tokenId}] Extracted stored stats from IPFS:`, JSON.stringify(storedStats, null, 2));
                console.log(`[image/${tokenId}] Attributes found:`, Object.keys(attrs));
                
                // Also check if metadata has an image field pointing to IPFS
                // If so, we could return that directly instead of regenerating
                if (metadata.image && (metadata.image.includes('ipfs') || metadata.image.includes('pinata'))) {
                  console.log(`Found IPFS image URL in metadata: ${metadata.image}`);
                }
              }
            }
          } catch (ipfsError) {
            console.log('Could not fetch from IPFS, will use current stats:', ipfsError);
          }
        }
      } catch {
        // tokenURI might not be available or not set, continue with current stats
        console.log('Could not get tokenURI, will use current stats');
      }

      // Use stored stats if available and valid, otherwise fetch current stats
      let tier, animal, stats;
      
      // Validate stored stats - check if they're not all zeros and have reasonable values
      const storedStatsValid = storedStats && storedTier && storedAnimal && 
        storedStats.tx_count > 0 && storedStats.nft_count >= 0;
      
      if (storedStatsValid) {
        // Use stats from IPFS metadata (mint-time stats)
        tier = storedTier;
        animal = storedAnimal;
        stats = storedStats;
        console.log(`[image/${tokenId}] Using stored stats from IPFS:`, JSON.stringify(stats, null, 2));
      } else {
        // Fallback: Fetch current stats (for backwards compatibility or if stored stats are invalid)
        console.log(`[image/${tokenId}] Stored stats invalid or missing, fetching current stats...`);
        const statsResponse = await fetch(
          `${req.nextUrl.origin}/api/stats?address=${owner.toLowerCase()}`
        );

        if (!statsResponse.ok) {
          return NextResponse.json(
            { error: "Failed to fetch stats" },
            { status: 500 }
          );
        }

        const statsData = await statsResponse.json();
        if (!statsData.ok) {
          return NextResponse.json(
            { error: "Stats not found" },
            { status: 404 }
          );
        }

        tier = statsData.tier;
        animal = statsData.animal;
        stats = statsData.stats;
        console.log(`[image/${tokenId}] Using current stats:`, JSON.stringify(stats, null, 2));
      }

      // Generate NFT image using the stats (either stored or current)
      console.log(`[image/${tokenId}] Generating image with stats:`, JSON.stringify(stats, null, 2));
      console.log(`[image/${tokenId}] Tier: ${tier}, Animal: ${animal}`);
      console.log(`[image/${tokenId}] Owner address: ${owner}`);
      
      // Validate address and stats before generating
      if (!owner || owner === '0x0000000000000000000000000000000000000000') {
        console.error(`[image/${tokenId}] Invalid owner address:`, owner);
        return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });
      }
      
      if (!stats || (stats.tx_count === 0 && stats.nft_count === 0)) {
        console.warn(`[image/${tokenId}] Stats appear to be zeros, but proceeding with image generation`);
      }
      
      const imageBuffer = await generateNFTImage({
        tier,
        animal,
        stats,
        address: owner.toLowerCase(),
      });
      console.log(`[image/${tokenId}] Image generated, size: ${imageBuffer.length} bytes`);

      // Return image
      return new NextResponse(imageBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Token not found" },
        { status: 404 }
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/image/[id] error:", message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

