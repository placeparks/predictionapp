import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PRESETS = {
  small: { w: 800, h: 420 },
  medium: { w: 1000, h: 525 },
  large: { w: 1200, h: 630 },
} as const;

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const wallet = searchParams.get("wallet") ?? "";
  const betTokens = parseNumber(searchParams.get("tokens"), -1);
  const total = parseNumber(searchParams.get("total"), 0);
  const won = parseNumber(searchParams.get("won"), 0);
  const lost = parseNumber(searchParams.get("lost"), 0);
  const pending = parseNumber(searchParams.get("pending"), 0);

  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;

  const fmt = (searchParams.get("fmt") ?? "jpeg").toLowerCase();
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet || "Wallet";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(1400px 800px at 50% 0%, #1e1b4b, #0a0e27 50%, #030712 100%)",
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
            padding: Math.round(w * 0.04),
            borderRadius: 28,
            background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(124,58,237,0.1))",
            border: "3px solid rgba(139, 92, 246, 0.4)",
            boxShadow: "0 30px 80px rgba(139, 92, 246, 0.3), 0 0 0 2px rgba(139, 92, 246, 0.1) inset",
            gap: Math.round(w * 0.025),
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: Math.round(w * 0.038),
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: "#fff",
                  display: "flex",
                }}
              >
                📊 BASE DAILY PORTFOLIO
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.02),
                  color: "rgba(255, 255, 255, 0.7)",
                  display: "flex",
                }}
              >
                Performance Snapshot
              </div>
            </div>
            <div
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                background: winRate >= 50 ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                border: `2px solid ${winRate >= 50 ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)"}`,
                fontSize: Math.round(w * 0.024),
                fontWeight: 800,
                color: winRate >= 50 ? "#22c55e" : "#ef4444",
                display: "flex",
              }}
            >
              {winRate}% WIN RATE
            </div>
          </div>

          {/* Wallet & Balance Card */}
          <div
            style={{
              padding: Math.round(w * 0.025),
              borderRadius: 20,
              background: "rgba(15, 23, 42, 0.6)",
              border: "2px solid rgba(139, 92, 246, 0.3)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  fontSize: Math.round(w * 0.018),
                  color: "rgba(255, 255, 255, 0.6)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  display: "flex",
                }}
              >
                Wallet
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.028),
                  fontWeight: 800,
                  color: "#fff",
                  fontFamily: "monospace",
                  display: "flex",
                }}
              >
                {truncated}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <div
                style={{
                  fontSize: Math.round(w * 0.018),
                  color: "rgba(255, 255, 255, 0.6)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  display: "flex",
                }}
              >
                BET Balance
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.038),
                  fontWeight: 900,
                  background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                  backgroundClip: "text",
                  color: "transparent",
                  display: "flex",
                }}
              >
                {betTokens >= 0 ? betTokens.toLocaleString("en-US") : "—"}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              gap: Math.round(w * 0.02),
            }}
          >
            {/* Total */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: Math.round(w * 0.02),
                borderRadius: 18,
                background: "rgba(251, 191, 36, 0.1)",
                border: "2px solid rgba(251, 191, 36, 0.3)",
                boxShadow: "0 10px 30px rgba(251, 191, 36, 0.15)",
              }}
            >
              <div
                style={{
                  fontSize: Math.round(w * 0.016),
                  letterSpacing: "0.1em",
                  color: "#fbbf24",
                  fontWeight: 700,
                  marginBottom: 12,
                  display: "flex",
                }}
              >
                TOTAL
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.055),
                  fontWeight: 900,
                  color: "#fff",
                  display: "flex",
                }}
              >
                {total}
              </div>
            </div>

            {/* Won */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: Math.round(w * 0.02),
                borderRadius: 18,
                background: "rgba(34, 197, 94, 0.1)",
                border: "2px solid rgba(34, 197, 94, 0.3)",
                boxShadow: "0 10px 30px rgba(34, 197, 94, 0.15)",
              }}
            >
              <div
                style={{
                  fontSize: Math.round(w * 0.016),
                  letterSpacing: "0.1em",
                  color: "#22c55e",
                  fontWeight: 700,
                  marginBottom: 12,
                  display: "flex",
                }}
              >
                WON ✓
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.055),
                  fontWeight: 900,
                  color: "#22c55e",
                  display: "flex",
                }}
              >
                {won}
              </div>
            </div>

            {/* Lost */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: Math.round(w * 0.02),
                borderRadius: 18,
                background: "rgba(239, 68, 68, 0.1)",
                border: "2px solid rgba(239, 68, 68, 0.3)",
                boxShadow: "0 10px 30px rgba(239, 68, 68, 0.15)",
              }}
            >
              <div
                style={{
                  fontSize: Math.round(w * 0.016),
                  letterSpacing: "0.1em",
                  color: "#ef4444",
                  fontWeight: 700,
                  marginBottom: 12,
                  display: "flex",
                }}
              >
                LOST ✗
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.055),
                  fontWeight: 900,
                  color: "#ef4444",
                  display: "flex",
                }}
              >
                {lost}
              </div>
            </div>

            {/* Live */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: Math.round(w * 0.02),
                borderRadius: 18,
                background: "rgba(59, 130, 246, 0.1)",
                border: "2px solid rgba(59, 130, 246, 0.3)",
                boxShadow: "0 10px 30px rgba(59, 130, 246, 0.15)",
              }}
            >
              <div
                style={{
                  fontSize: Math.round(w * 0.016),
                  letterSpacing: "0.1em",
                  color: "#3b82f6",
                  fontWeight: 700,
                  marginBottom: 12,
                  display: "flex",
                }}
              >
                LIVE ⚡
              </div>
              <div
                style={{
                  fontSize: Math.round(w * 0.055),
                  fontWeight: 900,
                  color: "#3b82f6",
                  display: "flex",
                }}
              >
                {pending}
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
                  background: "#8b5cf6",
                  boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.3)",
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
                color: "#a78bfa",
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
