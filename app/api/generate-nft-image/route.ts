import { NextRequest, NextResponse } from "next/server";
import { generateNFTImage } from "@/lib/imageGenerator";
import { computeTier, animalFor } from "@/lib/tier";

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

    const tier = computeTier(stats);
    const animal = animalFor(tier);

    // Generate NFT image
    const imageBuffer = await generateNFTImage({
      tier,
      animal,
      stats,
      address: address.toLowerCase(),
    });

    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Image}`;

    return NextResponse.json({
      ok: true,
      image: dataUri,
      tier,
      animal,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("/api/generate-nft-image error:", message);
    return NextResponse.json({ ok: false, error: "internal_error", message }, { status: 500 });
  }
}

