111111111111111111101000000import React from "react";
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

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

  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet || "Wallet";

  const statBoxes = [
    { label: "TOTAL", value: total, accent: "#fcd34d" },
    { label: "WON", value: won, accent: "#4ade80" },
    { label: "LOST", value: lost, accent: "#f87171" },
    { label: "LIVE", value: pending, accent: "#60a5fa" },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(145deg, rgba(9,11,25,1) 0%, rgba(25,35,73,1) 45%, rgba(57,24,108,1) 100%)",
          color: "#e2e8f0",
          padding: 64,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: "0.08em" }}>BASE DAILY</div>
            <div style={{ fontSize: 28, opacity: 0.85, marginTop: 8 }}>Portfolio Snapshot</div>
          </div>
          <div
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.06)",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            Win rate {winRate}%
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            padding: "1.5rem 2rem",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(14,20,42,0.6)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 24, opacity: 0.7 }}>Wallet</div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{truncated}</div>
          </div>
          <div
            style={{
              textAlign: "right",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            <div style={{ fontSize: 24, opacity: 0.7 }}>BET balance</div>
            <div style={{ fontSize: 42, fontWeight: 800, color: "#facc15" }}>
              {betTokens >= 0 ? betTokens.toLocaleString("en-US") : "—"}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 20,
          }}
        >
          {statBoxes.map((stat) => (
            <div
              key={stat.label}
              style={{
                borderRadius: 20,
                padding: "1.75rem",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${stat.accent}33`,
                boxShadow: `0 12px 30px ${stat.accent}1a`,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                flex: 1,
              }}
            >
              <div style={{ fontSize: 18, letterSpacing: "0.1em", color: stat.accent }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 54, fontWeight: 900 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto", opacity: 0.6, fontSize: 24 }}>prophecy.house</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
