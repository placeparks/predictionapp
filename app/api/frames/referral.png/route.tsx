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
  const code = searchParams.get("code") ?? "";
  const total = Number(searchParams.get("total") ?? "0") || 0;
  const active = Number(searchParams.get("active") ?? "0") || 0;

  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;

  const fmt = (searchParams.get("fmt") ?? "jpeg").toLowerCase();
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  // If it's a wallet address, shorten it for display
  const codeDisplay = code 
    ? (/^0x[a-f0-9]{40}$/i.test(code) 
        ? `${code.slice(0, 6).toUpperCase()}...${code.slice(-4).toUpperCase()}`
        : code.toUpperCase())
    : "GET-STARTED";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(1400px 800px at 50% 0%, #1a1f3a, #0a0e27 50%, #050812 100%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Main Card */}
        <div
          style={{
            width: Math.round(w - 80),
            height: Math.round(h - 80),
            display: "flex",
            flexDirection: "column",
            padding: Math.round(w * 0.045),
            borderRadius: 28,
            background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
            border: "3px solid rgba(255, 215, 0, 0.4)",
            boxShadow: "0 30px 80px rgba(255, 215, 0, 0.3), 0 0 0 2px rgba(255, 215, 0, 0.1) inset",
            position: "relative",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                background: "rgba(255, 215, 0, 0.2)",
                border: "2px solid rgba(255, 215, 0, 0.6)",
                fontSize: Math.round(w * 0.032),
                fontWeight: 800,
                color: "#FFD700",
                letterSpacing: "0.08em",
                display: "flex",
              }}
            >
              🎁 PROPHECY INVITE
            </div>
            <div
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                background: "linear-gradient(135deg, #f472b6, #facc15)",
                fontSize: Math.round(w * 0.022),
                fontWeight: 800,
                color: "#0f172a",
                display: "flex",
              }}
            >
              +50 BET TOKENS
            </div>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div
              style={{
                fontSize: Math.round(w * 0.026),
                color: "rgba(255, 255, 255, 0.7)",
                marginBottom: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                display: "flex",
              }}
            >
              Your Referral Code
            </div>
            
            {/* Code Display Box */}
            <div
              style={{
                padding: Math.round(w * 0.025),
                borderRadius: 20,
                background: "rgba(15, 23, 42, 0.8)",
                border: "3px solid rgba(255, 215, 0, 0.5)",
                boxShadow: "0 10px 40px rgba(255, 215, 0, 0.2), 0 0 20px rgba(255, 215, 0, 0.1) inset",
                marginBottom: Math.round(w * 0.025),
                display: "flex",
              }}
            >
              <div
                style={{
                  fontSize: Math.round(w * 0.06),
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  background: "linear-gradient(135deg, #FFD700, #FFA500)",
                  backgroundClip: "text",
                  color: "transparent",
                  textAlign: "center",
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {codeDisplay}
              </div>
            </div>

            {/* Stats using flex */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: Math.round(w * 0.02),
                marginBottom: Math.round(w * 0.025),
              }}
            >
              <div
                style={{
                  flex: 1,
                  padding: Math.round(w * 0.018),
                  borderRadius: 16,
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "2px solid rgba(99, 102, 241, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: Math.round(w * 0.017),
                    letterSpacing: "0.08em",
                    color: "rgba(255, 255, 255, 0.6)",
                    fontWeight: 700,
                    display: "flex",
                  }}
                >
                  TOTAL INVITES
                </div>
                <div
                  style={{
                    fontSize: Math.round(w * 0.05),
                    fontWeight: 900,
                    color: "#fff",
                    display: "flex",
                  }}
                >
                  {total}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  padding: Math.round(w * 0.018),
                  borderRadius: 16,
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "2px solid rgba(16, 185, 129, 0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: Math.round(w * 0.017),
                    letterSpacing: "0.08em",
                    color: "rgba(255, 255, 255, 0.6)",
                    fontWeight: 700,
                    display: "flex",
                  }}
                >
                  ACTIVE
                </div>
                <div
                  style={{
                    fontSize: Math.round(w * 0.05),
                    fontWeight: 900,
                    color: "#fff",
                    display: "flex",
                  }}
                >
                  {active}
                </div>
              </div>
            </div>

            {/* CTA Text */}
            <div
              style={{
                fontSize: Math.round(w * 0.024),
                color: "rgba(255, 255, 255, 0.8)",
                textAlign: "center",
                fontWeight: 600,
                lineHeight: 1.4,
                display: "flex",
                justifyContent: "center",
              }}
            >
              Join Prophecy • Predict the Future • Earn Rewards 🔮
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 20,
              borderTop: "2px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.3)",
                  display: "flex",
                }}
              />
              <div
                style={{
                  fontSize: Math.round(w * 0.02),
                  color: "rgba(255, 255, 255, 0.7)",
                  fontWeight: 600,
                  display: "flex",
                }}
              >
                Live on Base
              </div>
            </div>
            <div
              style={{
                fontSize: Math.round(w * 0.024),
                color: "#FFD700",
                fontWeight: 800,
                display: "flex",
              }}
            >
              prophecy.house
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
