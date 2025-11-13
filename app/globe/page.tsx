"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

const NeuralGlobe = dynamic(() => import("../components/NeuralGlobe"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 16, color: "#cbd5e1" }}>Loading 3D Globe…</div>
  ),
});

export default function GlobePage() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
      <h1 style={{
        fontSize: "1.5rem",
        fontWeight: 800,
        marginBottom: "1rem",
        color: "#fff",
        textShadow: "0 2px 12px rgba(0,0,0,0.4)",
      }}>
        Minters Globe
      </h1>
      <p style={{ color: "rgba(255,255,255,0.75)", marginBottom: 16 }}>
        Explore all minters on a neural network globe. Hover to see wins, win rate, and NFT tier.
      </p>
      <Suspense fallback={<div style={{ padding: 16, color: "#cbd5e1" }}>Preparing scene…</div>}>
        <NeuralGlobe />
      </Suspense>
    </main>
  );
}

