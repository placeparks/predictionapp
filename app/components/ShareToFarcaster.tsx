"use client";

import React, { useMemo, useState } from "react";
import { openWarpcastCompose } from "@/lib/farcaster/share";

type ShareKind = "nft" | "leaderboard" | "globe" | "portfolio";

type Props = {
  kind: ShareKind;
  wallet?: string;
  tokenId?: string | number;
  rank?: number;
  imageUrl?: string;
  pageUrl?: string;
  channelKey?: string;
  text?: string;
};

export default function ShareToFarcaster(props: Props) {
  const [busy, setBusy] = useState(false);

  const defaults = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const baseUrl = (envBase && envBase.length > 0 ? envBase : "https://prophecy.house").replace(/\/$/, "");

    switch (props.kind) {
      case "nft": {
        const image = props.imageUrl ?? (baseUrl ? `${baseUrl}/api/frames/nft.png?token=${props.tokenId ?? ""}` : `/api/frames/nft.png?token=${props.tokenId ?? ""}`);
        const link = props.pageUrl ?? (baseUrl ? `${baseUrl}/nft/${props.tokenId ?? ""}` : `/nft/${props.tokenId ?? ""}`);
        return {
          text: "Minted my Neural Shard on Base. ⚡️",
          image,
          link,
        };
      }
      case "leaderboard": {
        const image = props.imageUrl ?? (baseUrl ? `${baseUrl}/api/frames/leaderboard.png?rank=${props.rank ?? ""}` : `/api/frames/leaderboard.png?rank=${props.rank ?? ""}`);
        const link = props.pageUrl ?? (baseUrl ? `${baseUrl}/leaderboard` : `/leaderboard`);
        return {
          text: "Climbing the Base Daily leaderboard. 🏆",
          image,
          link,
        };
      }
      case "globe": {
        const image = props.imageUrl ?? (baseUrl ? `${baseUrl}/api/frames/globe.png?focus=${props.wallet ?? ""}` : `/api/frames/globe.png?focus=${props.wallet ?? ""}`);
        const link = props.pageUrl ?? (baseUrl ? `${baseUrl}/globe?focus=${props.wallet ?? ""}` : `/globe?focus=${props.wallet ?? ""}`);
        return {
          text: "I’m on the Neural Globe—live network of minters and predictors. 🌐",
          image,
          link,
        };
      }
      default: {
        const image = props.imageUrl ?? (baseUrl ? `${baseUrl}/api/frames/portfolio.png?wallet=${props.wallet ?? ""}` : `/api/frames/portfolio.png?wallet=${props.wallet ?? ""}`);
        const link = props.pageUrl ?? (baseUrl ? `${baseUrl}/portfolio/${props.wallet ?? ""}` : `/portfolio/${props.wallet ?? ""}`);
        return {
          text: "Here’s my Base Daily portfolio snapshot. 🔮",
          image,
          link,
        };
      }
    }
  }, [props]);

  const text = props.text ?? defaults.text;
  const embeds = [defaults.image, defaults.link].filter(Boolean) as string[];
  const channelKey = props.channelKey ?? "base";

  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          openWarpcastCompose({
            text,
            embeds,
            channelKey,
          });
          setBusy(false);
        }}
        style={{
          padding: "0.6rem 1rem",
          borderRadius: 12,
          border: "1px solid rgba(99,102,241,0.4)",
          background: "rgba(99,102,241,0.15)",
          color: "#c7d2fe",
          fontWeight: 700,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        Share on Farcaster
      </button>

      <button
        onClick={async () => {
          const href = openWarpcastCompose({ text, embeds, channelKey });
          if (typeof navigator !== "undefined" && navigator.clipboard) {
            try {
              await navigator.clipboard.writeText(href);
            } catch (err) {
              console.error("Failed to copy compose link:", err);
            }
          }
        }}
        style={{
          padding: "0.6rem 1rem",
          borderRadius: 12,
          border: "1px solid rgba(148,163,184,0.35)",
          background: "transparent",
          color: "#e2e8f0",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Copy compose link
      </button>
    </div>
  );
}
