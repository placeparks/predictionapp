"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";

const NeuralGlobe = dynamic(() => import("../components/NeuralGlobe"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 16, color: "#cbd5e1", textAlign: "center" }}>Loading 3D Globe…</div>
  ),
});

export default function GlobePage() {
  return (
    <main style={{ 
      maxWidth: 1200, 
      margin: "0 auto", 
      padding: "clamp(1rem, 4vw, 1.5rem)",
      minHeight: "100vh"
    }}>
      <h1 style={{
        fontSize: "clamp(1.25rem, 5vw, 1.5rem)",
        fontWeight: 800,
        marginBottom: "0.75rem",
        color: "#fff",
        textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        lineHeight: 1.2,
      }}>
        Forecast Engine
      </h1>
      <p style={{ 
        color: "rgba(255,255,255,0.75)", 
        marginBottom: 16,
        fontSize: "clamp(0.875rem, 3vw, 1rem)",
        lineHeight: 1.5,
      }}>
        Explore all minters on a neural network globe. Tap or hover to see wins, win rate, and NFT tier.
      </p>
      <Suspense fallback={<div style={{ padding: 16, color: "#cbd5e1", textAlign: "center" }}>Preparing scene…</div>}>
        <NeuralGlobe />
      </Suspense>
    </main>
  );
}

