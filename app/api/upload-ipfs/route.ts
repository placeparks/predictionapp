import { NextRequest, NextResponse } from "next/server";
import { generateNFTImage } from "@/lib/imageGenerator";
import { computeTier, animalFor, meetsTierRequirements } from "@/lib/tier";

interface NFTMetadata {
  name: string;
  description: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  external_url?: string;
}

// Upload to Pinata using JWT
async function uploadToPinata(file: Buffer, fileName: string, pinataJWT: string): Promise<string> {
  const formData = new FormData();
  
  // Convert Buffer to Uint8Array for File constructor compatibility
  const fileData = new Uint8Array(file);
  const fileBlob = new File([fileData], fileName, { type: 'image/png' });
  formData.append('file', fileBlob);
  formData.append('pinataMetadata', JSON.stringify({ name: fileName }));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pinataJWT}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { reason: 'UNKNOWN', details: errorText } };
      }

      // Check for quota/limit errors
      if (errorData.error?.reason === 'FORBIDDEN' || 
          errorData.error?.details?.includes('plan usage limit') ||
          errorData.error?.details?.includes('quota') ||
          res.status === 403) {
        throw new Error('PINATA_QUOTA_EXCEEDED: Your Pinata account has reached its usage limit. Please upgrade your plan or wait for quota reset.');
      }

      throw new Error(`Pinata upload failed: ${errorText}`);
    }

    const data = await res.json();
    return `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`;
  } catch (error) {
    console.error('Pinata upload error:', error);
    throw error;
  }
}

async function uploadToIPFS(imageBuffer: Buffer, metadata: NFTMetadata, pinataJWT?: string): Promise<string> {
  try {
    if (pinataJWT) {
      // Use Pinata if JWT is provided
      const imageUrl = await uploadToPinata(imageBuffer, 'nft-image.png', pinataJWT);

      // Create metadata JSON
      const metadataObj = {
        name: metadata.name,
        description: metadata.description,
        image: imageUrl,
        attributes: metadata.attributes,
        external_url: metadata.external_url || '',
      };

      // Upload metadata to Pinata
      const metadataJson = JSON.stringify(metadataObj);
      // File constructor accepts string directly for text data
      const metadataFile = new File([metadataJson], 'metadata.json', { type: 'application/json' });
      const metadataFormData = new FormData();
      metadataFormData.append('file', metadataFile);
      metadataFormData.append('pinataMetadata', JSON.stringify({ name: 'nft-metadata.json' }));
      metadataFormData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

      const metadataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pinataJWT}`,
        },
        body: metadataFormData,
      });

      if (!metadataRes.ok) {
        const errorText = await metadataRes.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { reason: 'UNKNOWN', details: errorText } };
        }

        // Check for quota/limit errors
        if (errorData.error?.reason === 'FORBIDDEN' || 
            errorData.error?.details?.includes('plan usage limit') ||
            errorData.error?.details?.includes('quota') ||
            metadataRes.status === 403) {
          throw new Error('PINATA_QUOTA_EXCEEDED: Your Pinata account has reached its usage limit. Please upgrade your plan or wait for quota reset.');
        }

        throw new Error(`Pinata metadata upload failed: ${errorText}`);
      }

      const metadataData = await metadataRes.json();
      return `https://gateway.pinata.cloud/ipfs/${metadataData.IpfsHash}`;
    } else {
      // Fallback: Return a placeholder URL (IPFS fallback requires additional setup)
      // In production, you should use Pinata or another IPFS service
      console.warn('[upload-ipfs] PINATA_JWT not set, returning placeholder URL');
      // In production, implement proper IPFS upload here
      // For now, we'll return an error to encourage using Pinata
      throw new Error('PINATA_JWT is required for IPFS upload. Please set PINATA_JWT environment variable.');
    }
  } catch (error) {
    console.error('IPFS upload error:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, stats } = body;

    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
      return NextResponse.json({ ok: false, error: "invalid_address" }, { status: 400 });
    }

    if (!stats) {
      return NextResponse.json({ ok: false, error: "missing_stats" }, { status: 400 });
    }

    console.log("[upload-ipfs] Starting upload for address:", address);
    console.log("[upload-ipfs] Stats received:", JSON.stringify(stats, null, 2));

    const tier = computeTier(stats);
    const animal = animalFor(tier);
    // Enforce strict eligibility: all tier requirements must be met
    if (!meetsTierRequirements(stats, tier)) {
      return NextResponse.json({ ok: false, error: "not_eligible", message: "Tier requirements are not fully met" }, { status: 403 });
    }
    console.log("[upload-ipfs] Tier:", tier, "Animal:", animal);
    console.log("[upload-ipfs] Stats for image generation - tx_count:", stats.tx_count, "nft_count:", stats.nft_count, "has_basename:", stats.has_basename, "basename:", stats.basename);

    // Generate NFT image
    let imageBuffer: Buffer;
    try {
      imageBuffer = await generateNFTImage({
        tier,
        animal,
        stats,
        address: address.toLowerCase(),
      });
      console.log("[upload-ipfs] Image generated, size:", imageBuffer.length);
    } catch (imageError) {
      console.error("[upload-ipfs] Image generation error:", imageError);
      return NextResponse.json({ 
        ok: false, 
        error: "image_generation_failed", 
        message: imageError instanceof Error ? imageError.message : String(imageError) 
      }, { status: 500 });
    }

    // Create metadata
    const attributes = [
      { trait_type: 'Tier', value: tier },
      { trait_type: 'Animal', value: animal },
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
      name: `${animal} - Tier ${tier}`,
      description: `On-chain stats NFT for ${address.slice(0, 6)}...${address.slice(-4)}. Transactions: ${stats.tx_count}, Unique Peers: ${stats.unique_peers}, ERC-20s: ${stats.erc20_count}, NFTs: ${stats.nft_count}`,
      attributes,
      external_url: `https://base.org`,
    };

    // Upload to IPFS (use Pinata JWT if available, otherwise fallback to public IPFS)
    const pinataJWT = process.env.PINATA_JWT;
    console.log("[upload-ipfs] Pinata JWT:", pinataJWT ? "Set" : "Not set");

    let metadataUrl: string;
    try {
      metadataUrl = await uploadToIPFS(imageBuffer, metadata, pinataJWT);
      console.log("[upload-ipfs] Upload successful, metadata URL:", metadataUrl);
    } catch (uploadError) {
      console.error("[upload-ipfs] IPFS upload error:", uploadError);
      
      const errorMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
      const isQuotaError = errorMessage.includes('PINATA_QUOTA_EXCEEDED') || 
                          errorMessage.includes('usage limit') ||
                          errorMessage.includes('quota') ||
                          errorMessage.includes('FORBIDDEN');
      
      return NextResponse.json({ 
        ok: false, 
        error: isQuotaError ? "pinata_quota_exceeded" : "ipfs_upload_failed", 
        message: errorMessage
      }, { status: isQuotaError ? 403 : 500 });
    }

    return NextResponse.json({
      ok: true,
      metadataUrl,
      tier,
      animal,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("/api/upload-ipfs error:", message);
    if (stack) console.error("Stack:", stack);
    return NextResponse.json({ 
      ok: false, 
      error: "internal_error", 
      message 
    }, { status: 500 });
  }
}

