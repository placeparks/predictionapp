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
  const focusWallet = searchParams.get("focus") ?? "";
  const truncated =
    focusWallet.length > 10 ? `${focusWallet.slice(0, 6)}…${focusWallet.slice(-4)}` : focusWallet || "Explorer";

  // choose preset and format
  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;

  const fmt = (searchParams.get("fmt") ?? "jpeg").toLowerCase(); // "jpeg" or "png"
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "radial-gradient(circle at 20% 20%,#3b82f6,#0f172a 65%)",
          padding: Math.round(w * 0.06),
          color: "#dbeafe",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: Math.round(w * 0.042), fontWeight: 800 }}>Neural Globe</div>
          <div style={{ fontSize: Math.round(w * 0.028), marginTop: Math.round(w * 0.018) }}>
            Mapping predictors, minters, and momentum across Base.
          </div>
          <div style={{ fontSize: Math.round(w * 0.025), marginTop: Math.round(w * 0.032), color: "#a5b4fc" }}>
            Focused: {truncated}
          </div>
        </div>
        <div style={{ fontSize: Math.round(w * 0.023), opacity: 0.7 }}>prophecy.house</div>
      </div>
    ),
    { width: w, height: h }
  );

  return new Response(image.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
