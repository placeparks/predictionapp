import React from "react";
import { ImageResponse } from "@vercel/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") ?? "";
  const total = Number(searchParams.get("total") ?? "0") || 0;
  const active = Number(searchParams.get("active") ?? "0") || 0;

  const codeDisplay = code ? code.toUpperCase() : "INVITE";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(140deg, #0b0f1e 0%, #1c2750 45%, #532b74 100%)",
          color: "#f8fafc",
          padding: 72,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: "0.08em" }}>PROPHECY INVITE</div>
        <div style={{ fontSize: 32, marginTop: 8, opacity: 0.85 }}>Share BET energy with friends</div>

        <div
          style={{
            marginTop: 40,
            padding: "1.75rem 2.25rem",
            borderRadius: 24,
            background: "rgba(15,23,42,0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 32,
          }}
        >
          <div>
            <div style={{ fontSize: 20, opacity: 0.7 }}>Referral code</div>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "0.3em" }}>{codeDisplay}</div>
          </div>
          <div
            style={{
              padding: "1rem 1.5rem",
              borderRadius: 16,
              background: "linear-gradient(135deg,#f472b6,#facc15)",
              color: "#0f172a",
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            +50 BET for new prophets
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: 24,
          }}
        >
          <div
            style={{
              padding: "1.5rem",
              borderRadius: 18,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 16, letterSpacing: "0.1em", opacity: 0.7 }}>TOTAL INVITES</div>
            <div style={{ fontSize: 52, fontWeight: 900 }}>{total}</div>
          </div>
          <div
            style={{
              padding: "1.5rem",
              borderRadius: 18,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 16, letterSpacing: "0.1em", opacity: 0.7 }}>ACTIVE</div>
            <div style={{ fontSize: 52, fontWeight: 900 }}>{active}</div>
          </div>
        </div>

        <div style={{ marginTop: "auto", opacity: 0.65, fontSize: 24 }}>prophecy.house</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
