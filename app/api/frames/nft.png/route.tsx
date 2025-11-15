import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// simple presets; you can tweak
const PRESETS = {
  small: { w: 800, h: 420 },
  medium: { w: 1000, h: 525 },
  large: { w: 1200, h: 630 },
} as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tokenId = searchParams.get("token") ?? "";
  const tier = searchParams.get("tier") ?? "Tier";
  const animal = searchParams.get("animal") ?? "Neural Shard";

  // choose preset and format
  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;

  const fmt = (searchParams.get("fmt") ?? "jpeg").toLowerCase(); // "jpeg" or "png"
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  // optional: include actual NFT art (pass art=URL-encoded absolute URL)
  const artUrl = searchParams.get("art");
  let artDataUrl: string | null = null;
  
  // Fetch the NFT image and convert to base64 data URL for @vercel/og
  if (artUrl) {
    try {
      const artResponse = await fetch(artUrl, {
        headers: {
          'Accept': 'image/*',
        },
      });
      if (artResponse.ok) {
        const arrayBuffer = await artResponse.arrayBuffer();
        // Convert ArrayBuffer to base64 (edge runtime compatible)
        const bytes = new Uint8Array(arrayBuffer);
        const binary = String.fromCharCode(...bytes);
        const base64 = btoa(binary);
        const contentType = artResponse.headers.get('content-type') || 'image/png';
        artDataUrl = `data:${contentType};base64,${base64}`;
      }
    } catch (error) {
      console.error('[nft.png] Failed to fetch art image:', error);
      // Continue without art if fetch fails
    }
  }

  const showArt = !!artDataUrl;

  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "row",
          background: "linear-gradient(135deg,#0c1224,#1b1640)",
          color: "#f8fafc",
          fontFamily: "Inter, system-ui, sans-serif",
          padding: 32,
        }}
      >
        {/* Left: optional artwork thumbnail (scaled, keeps bytes low) */}
        {showArt && (
          <div
            style={{
              width: Math.round(w * 0.36),
              height: Math.round(h - 64),
              borderRadius: 16,
              overflow: "hidden",
              marginRight: 24,
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            {/* Use data URL for reliable image loading in edge runtime */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artDataUrl!}
              alt="NFT"
              width={Math.round(w * 0.36)}
              height={Math.round(h - 64)}
              style={{ objectFit: "cover" }}
            />
          </div>
        )}

        {/* Right: text card */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: Math.round(h * 0.1), fontWeight: 800, lineHeight: 1.1 }}>
            Neural Shard Minted
          </div>
          <div style={{ marginTop: 8, fontSize: Math.round(h * 0.08), fontWeight: 700, color: "#fbbf24" }}>
            {`${tier} ${animal}`}
          </div>
          <div style={{ marginTop: 12, fontSize: Math.round(h * 0.07) }}>
            {`Token #${tokenId || "—"}`}
          </div>
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: Math.round(h * 0.055),
              opacity: 0.8,
            }}
          >
            <span>Minted on Base</span>
            <span>prophecy.house</span>
          </div>
        </div>
      </div>
    ),
    { width: w, height: h }
  );

  return new Response(image.body, {
    status: 200,
    headers: {
      "Content-Type": contentType, // JPEG is far smaller than PNG for cards
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
