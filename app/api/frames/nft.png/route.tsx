import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Sizes tuned for social cards
const PRESETS = {
  small: { w: 800, h: 420 },
  medium: { w: 1000, h: 525 },
  large: { w: 1200, h: 630 },
} as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Inputs with safe fallbacks
  const tokenId = searchParams.get("token") ?? "";
  const tier = searchParams.get("tier") ?? "Tier";
  const animal = searchParams.get("animal") ?? "Neural Shard";
  const artUrl = searchParams.get("art");
  const brand = (searchParams.get("brand") ?? "prophecy.house").slice(0, 48);
  const accent = searchParams.get("accent") ?? "#7c3aed"; // violet
  const chain = (searchParams.get("chain") ?? "Base").slice(0, 24);

  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;
  const fmt = (searchParams.get("fmt") ?? "png").toLowerCase();
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  // Helpers
  const chip = (label: string) => (
    <div
      style={{
        padding: `${Math.round(h * 0.012)} ${Math.round(h * 0.02)}`,
        borderRadius: 999,
        background: "rgba(15,23,42,0.08)",
        border: `2px solid ${accent}cc`,
        fontSize: Math.round(h * 0.04),
        fontWeight: 700,
        color: "#0f172a",
      }}
    >
      {label}
    </div>
  );

  const headerPill = (text: string) => (
    <div
      style={{
        padding: `${Math.round(h * 0.01)} ${Math.round(h * 0.018)}`,
        borderRadius: 999,
        background: `${accent}1a`,
        border: `2px solid ${accent}ff`,
        color: accent,
        fontSize: Math.round(h * 0.035),
        fontWeight: 800,
        letterSpacing: "0.08em",
      }}
    >
      {text}
    </div>
  );

  // Main card UI — layered, with soft elevation and clean hierarchy
  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(1200px 600px at 0% 0%, #0f172a, #0b1024 40%, #090b16 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            width: Math.round(w - 64),
            height: Math.round(h - 64),
            display: "flex",
            flexDirection: "row",
            gap: 24,
            padding: 28,
            borderRadius: 28,
            background: "linear-gradient(180deg,#ffffff,#f8fafc)",
            border: `3px solid ${accent}ff`,
            boxShadow:
              `0 24px 60px ${accent}40, 0 8px 30px rgba(2,6,23,0.15), inset 0 0 0 1px ${accent}33`,
          }}
        >
          {/* Artwork panel (medallion with accent ring) */}
          <div
            style={{
              width: Math.round((w - 64) * 0.36),
              height: Math.round(h - 64 - 56),
              borderRadius: 24,
              background: "linear-gradient(180deg,#eef2ff,#e9d5ff)",
              border: `3px solid ${accent}ff`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "78%",
                aspectRatio: "1 / 1",
                borderRadius: 9999,
                position: "relative",
                background: `radial-gradient(closest-side, ${accent} 0%, ${accent}80 55%, transparent 56%), conic-gradient(from 0deg, ${accent}, #22d3ee, ${accent})`,
                boxShadow:
                  `0 18px 60px ${accent}45, inset 0 0 60px rgba(255,255,255,0.35)`,
                padding: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 9999,
                  overflow: "hidden",
                  background: "#0f172a",
                  border: `3px solid ${accent}ff`,
                  boxShadow: `0 0 20px ${accent}80, inset 0 0 20px ${accent}40`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {artUrl ? (
                  <img
                    src={artUrl}
                    alt="NFT"
                    width={1024}
                    height={1024}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: `linear-gradient(135deg, ${accent}, #22d3ee)`,
                    }}
                  />
                )}
              </div>
            </div>
            {/* chain badge */}
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.95)",
                border: `2px solid ${accent}ff`,
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 22,
                boxShadow: `0 0 10px ${accent}60`,
              }}
            >
              ✅ {chain}
            </div>
          </div>

          {/* Details panel */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {headerPill("NEURAL SHARD")}
              {headerPill("MINTED")}
            </div>

            <div
              style={{
                marginTop: 16,
                fontSize: Math.round(h * 0.11),
                lineHeight: 1.04,
                fontWeight: 900,
                background: `linear-gradient(90deg, ${accent}, #22d3ee)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {tier} {animal}
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {chip(`Token #${tokenId || "—"}`)}
              {chip("On‑Chain Proof")}
              {chip("Claimable Perks")}
              {chip("Limited Edition")}
            </div>

            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    background: accent,
                    boxShadow: `${accent}80 0 0 0 6px`,
                  }}
                />
                <div style={{ color: "#334155", fontWeight: 700, fontSize: Math.round(h * 0.04) }}>
                  Minted on {chain}
                </div>
              </div>
              <div style={{ color: "#0f172a", fontWeight: 800, fontSize: Math.round(h * 0.045) }}>{brand}</div>
            </div>
          </div>
        </div>
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
