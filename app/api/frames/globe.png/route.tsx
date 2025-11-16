import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PRESETS = {
  small: { w: 800, h: 420 },
  medium: { w: 1000, h: 525 },
  large: { w: 1200, h: 630 },
} as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const focusWallet = searchParams.get("focus") ?? "";
  const truncated =
    focusWallet.length > 10 
      ? `${focusWallet.slice(0, 6)}…${focusWallet.slice(-4)}` 
      : focusWallet || "Explorer";

  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;

  const fmt = (searchParams.get("fmt") ?? "jpeg").toLowerCase();
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(1400px 800px at 50% 0%, #1e3a8a, #0a0e27 50%, #030712 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Main Card */}
        <div
          style={{
            width: Math.round(w - 80),
            height: Math.round(h - 80),
            display: "flex",
            flexDirection: "row",
            padding: Math.round(w * 0.04),
            borderRadius: 28,
            background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(30,58,138,0.1))",
            border: "3px solid rgba(59, 130, 246, 0.4)",
            boxShadow: "0 30px 80px rgba(59, 130, 246, 0.3), 0 0 0 2px rgba(59, 130, 246, 0.1) inset",
            gap: Math.round(w * 0.03),
          }}
        >
          {/* Left side - Globe visualization */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 20,
              background: "radial-gradient(circle at 30% 30%, rgba(59,130,246,0.3), rgba(15,23,42,0.8))",
              border: "2px solid rgba(59, 130, 246, 0.3)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Stylized globe representation using CSS */}
            <div
              style={{
                width: Math.round(w * 0.28),
                height: Math.round(w * 0.28),
                borderRadius: "50%",
                background: "radial-gradient(circle at 30% 30%, #3b82f6, #1e3a8a 60%, #0f172a 100%)",
                border: "3px solid rgba(147, 197, 253, 0.4)",
                boxShadow: "0 0 60px rgba(59, 130, 246, 0.4), inset 0 0 40px rgba(59, 130, 246, 0.2)",
                position: "relative",
                display: "flex",
              }}
            >
              {/* Glowing points on globe */}
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* Center glow */}
                <div
                  style={{
                    width: "40%",
                    height: "40%",
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(147, 197, 253, 0.6) 0%, transparent 70%)",
                    display: "flex",
                  }}
                />
              </div>
              
              {/* Orbital rings */}
              <div
                style={{
                  position: "absolute",
                  width: "110%",
                  height: "110%",
                  border: "2px solid rgba(99, 102, 241, 0.3)",
                  borderRadius: "50%",
                  top: "-5%",
                  left: "-5%",
                  display: "flex",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: "120%",
                  height: "120%",
                  border: "1px solid rgba(147, 197, 253, 0.2)",
                  borderRadius: "50%",
                  top: "-10%",
                  left: "-10%",
                  display: "flex",
                }}
              />
            </div>
            
            {/* Live indicator */}
            <div
              style={{
                position: "absolute",
                top: Math.round(w * 0.02),
                left: Math.round(w * 0.02),
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(34, 197, 94, 0.2)",
                border: "2px solid rgba(34, 197, 94, 0.5)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#22c55e",
                  boxShadow: "0 0 0 3px rgba(34, 197, 94, 0.3)",
                  display: "flex",
                }}
              />
              <div
                style={{
                  fontSize: Math.round(w * 0.018),
                  fontWeight: 700,
                  color: "#22c55e",
                  display: "flex",
                }}
              >
                LIVE
              </div>
            </div>
          </div>

          {/* Right side - Content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: "rgba(59, 130, 246, 0.2)",
                    border: "2px solid rgba(59, 130, 246, 0.6)",
                    fontSize: Math.round(w * 0.028),
                    fontWeight: 800,
                    color: "#60a5fa",
                    letterSpacing: "0.08em",
                    display: "flex",
                  }}
                >
                  🌐 NEURAL GLOBE
                </div>
              </div>

              <div
                style={{
                  fontSize: Math.round(w * 0.055),
                  fontWeight: 900,
                  lineHeight: 1.1,
                  background: "linear-gradient(135deg, #3b82f6, #60a5fa)",
                  backgroundClip: "text",
                  color: "transparent",
                  display: "flex",
                }}
              >
                Live Network
              </div>

              <div
                style={{
                  fontSize: Math.round(w * 0.022),
                  color: "rgba(255, 255, 255, 0.8)",
                  lineHeight: 1.4,
                  display: "flex",
                }}
              >
                Real-time visualization of minters, predictors, and on-chain momentum across Base.
              </div>

              {/* Focus info */}
              <div
                style={{
                  marginTop: 12,
                  padding: Math.round(w * 0.015),
                  borderRadius: 12,
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "2px solid rgba(59, 130, 246, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontSize: Math.round(w * 0.018),
                    color: "rgba(255, 255, 255, 0.6)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "flex",
                  }}
                >
                  Viewing
                </div>
                <div
                  style={{
                    fontSize: Math.round(w * 0.026),
                    fontWeight: 800,
                    color: "#60a5fa",
                    fontFamily: "monospace",
                    display: "flex",
                  }}
                >
                  {truncated}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 16,
                borderTop: "2px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.3)",
                    display: "flex",
                  }}
                />
                <div
                  style={{
                    fontSize: Math.round(w * 0.019),
                    color: "rgba(255, 255, 255, 0.7)",
                    fontWeight: 600,
                    display: "flex",
                  }}
                >
                  Powered by Base
                </div>
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.022),
                  color: "#60a5fa",
                  fontWeight: 800,
                  display: "flex",
                }}
              >
                prophecy.house
              </div>
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
