import { NextRequest, NextResponse } from "next/server";
import { generateNFTImage } from "@/lib/imageGenerator";
import { computeTier, animalFor } from "@/lib/tier";

export async function POST(req: NextRequest) {
  try {
    // Read body as text first to handle parse errors better
    const text = await req.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (jsonError) {
      console.error("[Test] JSON parse error. Received text:", text.substring(0, 200));
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_json",
          message: `Failed to parse JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. Make sure your JSON is properly formatted. For Windows: use double quotes and escape them, or use PowerShell Invoke-RestMethod instead of curl.`,
        },
        { status: 400 }
      );
    }
    const {
      address = "0x0000000000000000000000000000000000000000",
      stats,
    } = body;

    // If stats not provided, use default test stats (your actual stats for Tier 4 Dragon)
    const testStats = stats || {
      tx_count: 36,
      unique_peers: 9,
      erc20_count: 1,
      nft_count: 9,
      nft_collections: 0,
      erc20_usd: 0,
      has_basename: false,
      basename: undefined,
    };

    // Compute tier
    const tier = computeTier(testStats);
    const animal = animalFor(tier);

    console.log(`[Test] Generating image for Tier ${tier} - ${animal}`);
    console.log(`[Test] Stats:`, testStats);

    // Generate NFT image
    const imageBuffer = await generateNFTImage({
      tier,
      animal,
      stats: testStats,
      address,
    });

    console.log(`[Test] Image generated successfully (${imageBuffer.length} bytes)`);

    // Convert to base64 for response
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    return NextResponse.json({
      ok: true,
      image: dataUri,
      tier,
      animal,
      stats: testStats,
      imageSize: imageBuffer.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Test] Image generation error:", message);
    return NextResponse.json(
      {
        ok: false,
        error: "image_generation_failed",
        message,
      },
      { status: 500 }
    );
  }
}

// GET endpoint for easy browser testing
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const address = searchParams.get("address") || "0x0000000000000000000000000000000000000000";
  
  // Parse stats from query params (default to your actual stats)
  const stats = {
    tx_count: parseInt(searchParams.get("tx_count") || "36"),
    unique_peers: parseInt(searchParams.get("unique_peers") || "9"),
    erc20_count: parseInt(searchParams.get("erc20_count") || "1"),
    nft_count: parseInt(searchParams.get("nft_count") || "9"),
    nft_collections: parseInt(searchParams.get("nft_collections") || "0"),
    erc20_usd: 0,
    has_basename: searchParams.get("has_basename") === "true",
    basename: searchParams.get("basename") || undefined,
  };

  try {
    const tier = computeTier(stats);
    const animal = animalFor(tier);

    const imageBuffer = await generateNFTImage({
      tier,
      animal,
      stats,
      address,
    });

    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    // Return as HTML page with the image
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>NFT Image Test - Tier ${tier} ${animal}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #1a1a1a;
      color: #fff;
      padding: 2rem;
      text-align: center;
    }
    img {
      max-width: 100%;
      border: 2px solid #00ffff;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0, 255, 255, 0.3);
    }
    .info {
      margin: 2rem 0;
      padding: 1rem;
      background: #2a2a2a;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <h1>NFT Image Generation Test</h1>
  <div class="info">
    <p><strong>Tier:</strong> ${tier}</p>
    <p><strong>Animal:</strong> ${animal}</p>
    <p><strong>Transactions:</strong> ${stats.tx_count}</p>
    <p><strong>NFTs:</strong> ${stats.nft_count}</p>
    <p><strong>Tokens:</strong> ${stats.erc20_count}</p>
    <p><strong>Unique Peers:</strong> ${stats.unique_peers}</p>
    ${stats.has_basename && stats.basename ? `<p><strong>Basename:</strong> ${stats.basename}</p>` : ''}
  </div>
  <img src="${dataUri}" alt="NFT Image Test" />
</body>
</html>`,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
