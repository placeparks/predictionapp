import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rankParam = searchParams.get("rank");
  const rank = rankParam ? Number.parseInt(rankParam, 10) : null;

  const headline = rank ? `Currently ranked #${rank}` : "Climbing the leaderboard";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg,#0c1327,#1e2a4d)",
          padding: 64,
          color: "#e0f2fe",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div>
          <div style={{ fontSize: 52, fontWeight: 800, color: "#38bdf8" }}>Base Daily Leaderboard</div>
          <div style={{ fontSize: 38, marginTop: 24 }}>{headline}</div>
        </div>
        <div style={{ fontSize: 26, opacity: 0.75 }}>prophecy.house</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
