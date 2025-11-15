import React from "react";
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get("token") ?? "";
  const tier = searchParams.get("tier") ?? "Tier";
  const animal = searchParams.get("animal") ?? "Neural Shard";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg,#132042,#271a45)",
          padding: 64,
          color: "#f8fafc",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 54, fontWeight: 800, marginBottom: 20 }}>Neural Shard Minted</div>
        <div style={{ fontSize: 42, fontWeight: 700, color: "#fbbf24" }}>
          {`${tier} ${animal}`}
        </div>
        <div style={{ marginTop: 24, fontSize: 36 }}>{`Token #${tokenId || "—"}`}</div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 26,
            opacity: 0.8,
          }}
        >
          <span>Minted on Base</span>
          <span>prophecy.house</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
