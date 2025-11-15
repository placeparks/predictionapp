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
  const code = searchParams.get("code") ?? "";
  const total = Number(searchParams.get("total") ?? "0") || 0;
  const active = Number(searchParams.get("active") ?? "0") || 0;

  // choose preset and format
  const sizeKey = (searchParams.get("size") ?? "small") as keyof typeof PRESETS;
  const { w, h } = PRESETS[sizeKey] ?? PRESETS.small;

  const fmt = (searchParams.get("fmt") ?? "jpeg").toLowerCase(); // "jpeg" or "png"
  const contentType = fmt === "png" ? "image/png" : "image/jpeg";

  const codeDisplay = code ? code.toUpperCase() : "INVITE";

  const image = new ImageResponse(
    (
      <div
        style={{
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(140deg, #0b0f1e 0%, #1c2750 45%, #532b74 100%)",
          color: "#f8fafc",
          padding: Math.round(w * 0.06),
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: Math.round(w * 0.04), fontWeight: 800, letterSpacing: "0.08em" }}>
          PROPHECY INVITE
        </div>
        <div style={{ fontSize: Math.round(w * 0.027), marginTop: 8, opacity: 0.85 }}>
          Share BET energy with friends
        </div>

        <div
          style={{
            marginTop: Math.round(w * 0.033),
            padding: `${Math.round(w * 0.015)} ${Math.round(w * 0.019)}`,
            borderRadius: Math.round(w * 0.02),
            background: "rgba(15,23,42,0.7)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: Math.round(w * 0.027),
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: Math.round(w * 0.017), opacity: 0.7 }}>Referral code</div>
            <div style={{ fontSize: Math.round(w * 0.047), fontWeight: 900, letterSpacing: "0.3em" }}>
              {codeDisplay}
            </div>
          </div>
          <div
            style={{
              padding: `${Math.round(w * 0.008)} ${Math.round(w * 0.012)}`,
              borderRadius: Math.round(w * 0.013),
              background: "linear-gradient(135deg,#f472b6,#facc15)",
              color: "#0f172a",
              fontSize: Math.round(w * 0.022),
              fontWeight: 800,
            }}
          >
            +50 BET for new prophets
          </div>
        </div>

        <div
          style={{
            marginTop: Math.round(w * 0.03),
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            gap: Math.round(w * 0.02),
          }}
        >
          <div
            style={{
              padding: Math.round(w * 0.012),
              borderRadius: Math.round(w * 0.015),
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: Math.round(w * 0.013), letterSpacing: "0.1em", opacity: 0.7 }}>
              TOTAL INVITES
            </div>
            <div style={{ fontSize: Math.round(w * 0.043), fontWeight: 900 }}>{total}</div>
          </div>
          <div
            style={{
              padding: Math.round(w * 0.012),
              borderRadius: Math.round(w * 0.015),
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: Math.round(w * 0.013), letterSpacing: "0.1em", opacity: 0.7 }}>
              ACTIVE
            </div>
            <div style={{ fontSize: Math.round(w * 0.043), fontWeight: 900 }}>{active}</div>
          </div>
        </div>

        <div style={{ marginTop: "auto", opacity: 0.65, fontSize: Math.round(w * 0.02) }}>
          prophecy.house
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
