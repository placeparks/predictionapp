import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const focusWallet = searchParams.get("focus") ?? "";
  const truncated =
    focusWallet.length > 10 ? `${focusWallet.slice(0, 6)}…${focusWallet.slice(-4)}` : focusWallet || "Explorer";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "radial-gradient(circle at 20% 20%,#3b82f6,#0f172a 65%)",
          padding: 72,
          color: "#dbeafe",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div>
          <div style={{ fontSize: 50, fontWeight: 800 }}>Neural Globe</div>
          <div style={{ fontSize: 34, marginTop: 22 }}>
            Mapping predictors, minters, and momentum across Base.
          </div>
          <div style={{ fontSize: 30, marginTop: 38, color: "#a5b4fc" }}>Focused: {truncated}</div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.7 }}>prophecy.house</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
