"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Clock, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { computeBaseDailySession } from "@/lib/baseDaily";

type SessionPhase = "break" | "open" | "locked" | "settled";

interface SessionInfo {
  id: string;
  phase: SessionPhase;
  openAt: string;
  closeAt: string;
  lockAt: string;
  resolveAt: string;
  nextOpenAt: string;
  anchorTime: string | null;
  anchorBlock: number | null;
  metrics: Record<string, unknown>;
  updatedAt: string | null;
}

interface MarketPayload {
  id: string;
  title: string;
  description: string;
  category: string;
  yesLabel: string;
  noLabel: string;
  stats: {
    currentYes: number;
    currentNo: number;
    userPick: "yes" | "no" | null;
    outcome: "yes" | "no" | null;
    resolvedAt: string | null;
    awarded: boolean;
    awardedAt: string | null;
  };
  previous: {
    sessionId: string;
    outcome: "yes" | "no";
    resolvedAt: string | null;
    awardedAt: string | null;
    winners: number;
    participants: number;
  } | null;
}

interface BaseDailyResponse {
  ok: boolean;
  serverTime: string;
  session: SessionInfo;
  previousSession: {
    id: string;
    phase: SessionPhase | null;
    resolveAt: string | null;
    anchorTime: string | null;
    updatedAt: string | null;
  } | null;
  markets: MarketPayload[];
}

interface BaseDailyErrorResponse {
  ok: boolean;
  error?: string;
  message?: string;
}

interface ConfirmChoice {
  marketId: string;
  marketTitle: string;
  side: "yes" | "no";
  yesLabel: string;
  noLabel: string;
}

const phaseLabels: Record<SessionPhase, string> = {
  break: "Break window",
  open: "Trading open",
  locked: "Locked for review",
  settled: "Settled",
};

const phaseTarget = (phase: SessionPhase, session: SessionInfo) => {
  if (phase === "break") return session.openAt;
  if (phase === "open") return session.closeAt;
  return session.resolveAt;
};

const formatCountdown = (ms: number) => {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatSessionDate = (iso: string | null | undefined) => {
  if (!iso) return "--";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function BaseDailyPredictions() {
  const { address } = useAccount();
  const [data, setData] = useState<BaseDailyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingMarket, setPendingMarket] = useState<string | null>(null);
  const [confirmChoice, setConfirmChoice] = useState<ConfirmChoice | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());

  const sessionPhase: SessionPhase = data?.session?.phase ?? "break";
  const sessionTargetIso = data ? phaseTarget(sessionPhase, data.session) : null;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const query = address ? `?user=${address}` : "";
      const res = await fetch(`/api/base-daily${query}`, { cache: "no-store" });
      const payload = (await res.json()) as BaseDailyResponse | BaseDailyErrorResponse;
      if (!res.ok || !payload?.ok) {
        const errorPayload = payload as BaseDailyErrorResponse;
        throw new Error(errorPayload?.error || errorPayload?.message || "failed");
      }
      setData(payload as BaseDailyResponse);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchData();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [fetchData]);

  const countdown = useMemo(() => {
    if (!sessionTargetIso) return null;
    return formatCountdown(new Date(sessionTargetIso).getTime() - now);
  }, [sessionTargetIso, now]);

  const submitPrediction = useCallback(
    async (marketId: string, side: "yes" | "no") => {
      if (!address || !data?.session) return false;
      setPendingMarket(marketId);
      try {
        const res = await fetch("/api/base-daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user: address,
            marketId,
            side,
            sessionId: data.session.id,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.ok) {
          const message = payload?.message || payload?.error || "Failed to record prediction";
          throw new Error(String(message));
        }
        setData((prev) => {
          if (!prev) return prev;
          const updatedMarkets = prev.markets.map((market) => {
            if (market.id !== marketId) return market;
            return {
              ...market,
              stats: {
                ...market.stats,
                userPick: side,
                currentYes: payload?.tallies?.yes ?? market.stats.currentYes,
                currentNo: payload?.tallies?.no ?? market.stats.currentNo,
              },
            };
          });
          return { ...prev, markets: updatedMarkets };
        });
        setError(null);
        void fetchData();
        
        // Refresh energy after successful prediction
        if (address) {
          // Trigger a custom event to refresh HeaderEnergy in the parent
          window.dispatchEvent(new CustomEvent("energy-updated", {
            detail: { address }
          }));
        }
        
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to record prediction";
        setError(msg);
        if (/locked|already/i.test(msg)) {
          void fetchData();
        }
        return false;
      } finally {
        setPendingMarket(null);
      }
    },
    [address, data?.session, fetchData]
  );

  const handleConfirmSubmit = useCallback(async () => {
    if (!confirmChoice) return;
    const success = await submitPrediction(confirmChoice.marketId, confirmChoice.side);
    if (success) {
      setConfirmChoice(null);
    }
  }, [confirmChoice, submitPrediction]);

  const sessionStatusColor = sessionPhase === "open"
    ? "rgba(16, 185, 129, 0.9)"
    : sessionPhase === "locked"
      ? "rgba(251, 191, 36, 0.9)"
      : sessionPhase === "settled"
        ? "rgba(129, 140, 248, 0.9)"
        : "rgba(96, 165, 250, 0.9)";

  return (
    <>
      {/* Floating Particles Background */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 25%, #0f1419 50%, #1a1f3a 75%, #0a0e27 100%)',
        backgroundSize: '400% 400%',
        animation: 'gradient-shift 20s ease infinite'
      }}>
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              width: `${Math.random() * 100 + 20}px`,
              height: `${Math.random() * 100 + 20}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `radial-gradient(circle, ${
                ['rgba(255, 107, 53, 0.1)', 'rgba(120, 208, 66, 0.1)', 'rgba(99, 102, 241, 0.1)', 'rgba(255, 215, 0, 0.1)'][Math.floor(Math.random() * 4)]
              } 0%, transparent 70%)`,
              animationDelay: `${Math.random() * 6}s`,
              animationDuration: `${Math.random() * 4 + 4}s`
            }}
          />
        ))}
      </div>
      <div style={{ 
        display: "flex", 
        flexDirection: "column", 
        gap: "1.5rem", 
        position: "relative", 
        zIndex: 1,
        minHeight: "100vh",
        background: "transparent"
      }}>
      <style>{`
        /* Vibrant card styling with candy colors and glowing effects */
        .session-header {
          background: linear-gradient(135deg, rgba(47, 27, 92, 0.9), rgba(92, 30, 61, 0.9)) !important;
          border: 3px solid rgba(255, 215, 0, 0.4) !important;
          border-radius: 20px !important;
          box-shadow: 0 12px 40px rgba(139, 92, 246, 0.4), 0 0 30px rgba(236, 72, 153, 0.3) !important;
        }

        .market-card {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 240, 245, 0.98)) !important;
          border: 3px solid rgba(255, 152, 0, 0.3) !important;
          border-radius: 18px !important;
          box-shadow: 0 8px 30px rgba(255, 152, 0, 0.2), 0 0 20px rgba(255, 215, 0, 0.1) !important;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        .market-card:hover {
          transform: translateY(-8px) scale(1.02) !important;
          box-shadow: 0 16px 50px rgba(255, 152, 0, 0.4), 0 0 30px rgba(255, 215, 0, 0.2) !important;
          border-color: rgba(255, 107, 53, 0.6) !important;
        }

        .yes-button {
          background: linear-gradient(135deg, rgba(78, 222, 128, 0.85), rgba(46, 180, 100, 0.85)) !important;
          border: 2px solid rgba(78, 222, 128, 0.5) !important;
          border-radius: 12px !important;
          color: #FFFFFF !important;
          font-weight: 700 !important;
          transition: all 0.3s !important;
        }

        .yes-button:hover:not(:disabled) {
          transform: translateY(-3px) scale(1.05) !important;
          box-shadow: 0 8px 20px rgba(78, 222, 128, 0.4) !important;
        }

        .yes-button:active:not(:disabled) {
          animation: bounce-playful 0.4s ease-out !important;
        }

        .no-button {
          background: linear-gradient(135deg, rgba(248, 113, 113, 0.85), rgba(239, 68, 68, 0.85)) !important;
          border: 2px solid rgba(248, 113, 113, 0.5) !important;
          border-radius: 12px !important;
          color: #FFFFFF !important;
          font-weight: 700 !important;
          transition: all 0.3s !important;
        }

        .no-button:hover:not(:disabled) {
          transform: translateY(-3px) scale(1.05) !important;
          box-shadow: 0 8px 20px rgba(248, 113, 113, 0.4) !important;
        }

        .no-button:active:not(:disabled) {
          animation: bounce-playful 0.4s ease-out !important;
        }

        .refresh-btn {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.8), rgba(168, 85, 247, 0.8)) !important;
          border: 2px solid rgba(99, 102, 241, 0.5) !important;
          border-radius: 12px !important;
          color: #FFFFFF !important;
          font-weight: 700 !important;
          transition: all 0.3s !important;
        }

        .refresh-btn:hover:not(:disabled) {
          transform: rotate(-15deg) scale(1.1) !important;
          box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4) !important;
        }

        .stat-box {
          background: linear-gradient(135deg, rgba(255, 107, 53, 0.1), rgba(255, 152, 0, 0.1)) !important;
          border: 2px solid rgba(255, 152, 0, 0.3) !important;
          border-radius: 14px !important;
        }

        .modal-content {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(255, 245, 250, 0.98)) !important;
          border: 3px solid rgba(255, 107, 53, 0.3) !important;
          border-radius: 20px !important;
          box-shadow: 0 20px 60px rgba(255, 107, 53, 0.3) !important;
        }

        @keyframes bounce-playful {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>

      <div
        className="session-header"
        style={{
          background: "linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(236, 72, 153, 0.9))",
          border: "3px solid rgba(255, 215, 0, 0.4)",
          borderRadius: 20,
          padding: "1.5rem",
          backdropFilter: "blur(10px)",
          boxShadow: "0 12px 40px rgba(139, 92, 246, 0.4), 0 0 30px rgba(236, 72, 153, 0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.65rem", fontWeight: 800, color: "#fff" }}>
              Base Daily Predictors
            </h1>
            <p style={{ margin: "0.35rem 0 0", color: "rgba(255, 255, 255, 0.9)", fontSize: "0.95rem", fontWeight: 500 }}>
              Ten daily Base chain benchmarks. Pick a side, check back after review, and winners claim 1 BET token.
            </p>
          </div>
          <button
            onClick={() => void fetchData()}
            className="vibrant-button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.75rem 1.5rem",
              borderRadius: "16px",
              border: "2px solid rgba(255, 255, 255, 0.3)",
              background: "linear-gradient(135deg, rgba(255, 107, 53, 0.2), rgba(139, 92, 246, 0.2))",
              backdropFilter: "blur(10px)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.875rem",
              transition: "all 0.3s",
              boxShadow: "0 4px 16px rgba(255, 107, 53, 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.05)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(255, 107, 53, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(255, 107, 53, 0.2)";
            }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <div
          style={{
            marginTop: "1.5rem",
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          }}
        >
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.05)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "2px solid rgba(255, 255, 255, 0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
          >
            <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
              Session
            </span>
            <strong style={{ color: "#fff", fontSize: "1.3rem", fontWeight: 800 }}>{data?.session?.id ?? computeBaseDailySession().sessionId}</strong>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.4rem 0.8rem", background: "rgba(255, 255, 255, 0.1)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: sessionStatusColor, boxShadow: `0 0 10px ${sessionStatusColor}` }} />
              <span style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 700 }}>{phaseLabels[sessionPhase]}</span>
            </div>
          </div>
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.05)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "2px solid rgba(255, 255, 255, 0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
          >
            <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
              Next event
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
              <Clock size={18} style={{ filter: "drop-shadow(0 2px 8px rgba(255, 107, 53, 0.5))" }} />
              <strong style={{ fontSize: "1.3rem", fontWeight: 800, textShadow: "0 2px 8px rgba(255, 107, 53, 0.3)" }}>{countdown ?? "--:--"}</strong>
            </div>
            <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.85rem", fontWeight: 500 }}>
              Ends at {sessionTargetIso ? formatSessionDate(sessionTargetIso) : "pending"}
            </span>
          </div>
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "20px",
              background: "rgba(255, 255, 255, 0.05)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "2px solid rgba(255, 215, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              boxShadow: "0 8px 32px rgba(255, 215, 0, 0.2)",
            }}
          >
            <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
              Daily cadence
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#FFD700" }}>
              <Zap size={18} style={{ filter: "drop-shadow(0 2px 8px rgba(255, 215, 0, 0.5))" }} />
              <strong style={{ fontSize: "1rem", fontWeight: 700, textShadow: "0 2px 8px rgba(255, 215, 0, 0.3)" }}>Closes 5 min early · 10 min break reset</strong>
            </div>
            <span style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.85rem", fontWeight: 500 }}>
              Winners each market earn 1 BET token automatically after review.
            </span>
          </div>
        </div>
        <div style={{ marginTop: "1rem", color: "rgba(148,163,184,0.7)", fontSize: "0.75rem" }}>
          Last updated {new Date(lastUpdated).toLocaleTimeString()}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(248, 113, 113, 0.1)",
            border: "1px solid rgba(248, 113, 113, 0.25)",
            borderRadius: 12,
            padding: "1rem",
            color: "#fecaca",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {!address && (
        <div
          style={{
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: 12,
            padding: "1rem",
            color: "#bfdbfe",
            fontSize: "0.85rem",
          }}
        >
          Connect your wallet to submit picks for today&apos;s markets.
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: "center", padding: "2rem", color: "rgba(226,232,240,0.7)" }}>
          Loading daily markets...
        </div>
      )}

      {data && (
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {data.markets.map((market) => {
            const yesVotes = market.stats.currentYes;
            const noVotes = market.stats.currentNo;
            const totalVotes = yesVotes + noVotes;
            const yesPct = totalVotes === 0 ? 0 : Math.round((yesVotes / totalVotes) * 100);
            const locked = sessionPhase !== "open";
            const userPick = market.stats.userPick;
            const alreadySubmitted = Boolean(userPick);
            const awaitingOutcome = sessionPhase === "locked" && !market.stats.outcome;
            const resolvedText = market.stats.outcome
              ? `${market.stats.outcome.toUpperCase()} · ${market.stats.awarded ? "Awarded" : "Pending BET tokens"}`
              : awaitingOutcome
                ? "Review in progress"
                : "Open";
            const displayResolvedText =
              !market.stats.outcome && alreadySubmitted && !awaitingOutcome
                ? "Prediction locked"
                : resolvedText;

            return (
              <article
                key={market.id}
                className="interactive-card"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  border: "2px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "24px",
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset",
                  transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  position: "relative",
                  overflow: "hidden",
                  animation: "slide-up 0.6s ease-out forwards",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-8px) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.2) inset, 0 0 80px rgba(255, 107, 53, 0.2)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                  e.currentTarget.style.boxShadow = "0 10px 40px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                }}
              >
                <header style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <span
                      style={{
                        alignSelf: "flex-start",
                        padding: "0.4rem 0.8rem",
                        borderRadius: "12px",
                        background: "linear-gradient(135deg, rgba(255, 107, 53, 0.2), rgba(139, 92, 246, 0.2))",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        color: "#fff",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        boxShadow: "0 4px 12px rgba(255, 107, 53, 0.2)",
                        animation: "pulse-glow 2s ease-in-out infinite",
                      }}
                    >
                      {market.category}
                    </span>
                    <h2 style={{ margin: 0, color: "#fff", fontSize: "1.1rem", lineHeight: 1.35 }}>
                      {market.title}
                    </h2>
                  </div>
                  {market.stats.outcome && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#34d399", fontSize: "0.75rem", fontWeight: 600 }}>
                      <ShieldCheck size={16} /> Settled
                    </div>
                  )}
                </header>

                <p style={{ margin: 0, color: "rgba(203,213,225,0.8)", fontSize: "0.85rem", lineHeight: 1.5 }}>
                  {market.description}
                </p>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    padding: "1rem",
                    borderRadius: "16px",
                    background: "rgba(0, 0, 0, 0.2)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", fontSize: "0.85rem", fontWeight: 600 }}>
                    <span>{market.yesLabel}</span>
                    <strong style={{ fontSize: "1rem", fontWeight: 800, color: "#78d042" }}>{yesVotes}</strong>
                  </div>
                  <div style={{ 
                    height: 10, 
                    borderRadius: "999px", 
                    background: "rgba(255, 255, 255, 0.1)", 
                    overflow: "hidden",
                    position: "relative",
                    boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
                  }}>
                    <div
                      style={{
                        width: `${yesPct}%`,
                        background: "linear-gradient(90deg, rgba(120, 208, 66, 0.9), rgba(78, 222, 128, 1))",
                        height: "100%",
                        transition: "width 0.5s ease",
                        boxShadow: "0 0 15px rgba(120, 208, 66, 0.6)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", fontSize: "0.85rem", fontWeight: 600, marginTop: "0.25rem" }}>
                    <span>{market.noLabel}</span>
                    <strong style={{ fontSize: "1rem", fontWeight: 800, color: "#f87171" }}>{noVotes}</strong>
                  </div>
                  <div style={{ 
                    height: 10, 
                    borderRadius: "999px", 
                    background: "rgba(255, 255, 255, 0.1)", 
                    overflow: "hidden",
                    position: "relative",
                    boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.2)"
                  }}>
                    <div
                      style={{
                        width: `${100 - yesPct}%`,
                        background: "linear-gradient(90deg, rgba(248, 113, 113, 0.9), rgba(239, 68, 68, 1))",
                        height: "100%",
                        transition: "width 0.5s ease",
                        boxShadow: "0 0 15px rgba(248, 113, 113, 0.6)",
                        borderRadius: "999px",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {(["yes", "no"] as const).map((side) => {
                    const active = userPick === side;
                    const disabled =
                      !address ||
                      locked ||
                      pendingMarket === market.id ||
                      alreadySubmitted;
                    const label = side === "yes" ? market.yesLabel : market.noLabel;
                    const color = side === "yes" ? "#22c55e" : "#f87171";

                    return (
                      <button
                        key={side}
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          setError(null);
                          setConfirmChoice({
                            marketId: market.id,
                            marketTitle: market.title,
                            side,
                            yesLabel: market.yesLabel,
                            noLabel: market.noLabel,
                          });
                        }}
                        style={{
                          padding: "1rem 1.25rem",
                          borderRadius: "16px",
                          border: active
                            ? `2px solid ${color}`
                            : "2px solid rgba(255, 255, 255, 0.2)",
                          background: active
                            ? `linear-gradient(135deg, ${side === "yes" ? "rgba(120, 208, 66, 0.2)" : "rgba(248, 113, 113, 0.2)"}, ${side === "yes" ? "rgba(78, 222, 128, 0.2)" : "rgba(239, 68, 68, 0.2)"})`
                            : "rgba(255, 255, 255, 0.05)",
                          backdropFilter: "blur(10px)",
                          color: active ? "#fff" : "rgba(255, 255, 255, 0.8)",
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                          cursor: disabled ? "not-allowed" : "pointer",
                          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                          boxShadow: active 
                            ? `0 8px 24px ${side === "yes" ? "rgba(120, 208, 66, 0.3)" : "rgba(248, 113, 113, 0.3)"}`
                            : "0 4px 12px rgba(0, 0, 0, 0.1)",
                          opacity: disabled ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (!disabled) {
                            e.currentTarget.style.transform = "translateY(-2px) scale(1.05)";
                            e.currentTarget.style.boxShadow = active
                              ? `0 12px 32px ${side === "yes" ? "rgba(120, 208, 66, 0.4)" : "rgba(248, 113, 113, 0.4)"}`
                              : "0 8px 20px rgba(255, 255, 255, 0.1)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0) scale(1)";
                          e.currentTarget.style.boxShadow = active 
                            ? `0 8px 24px ${side === "yes" ? "rgba(120, 208, 66, 0.3)" : "rgba(248, 113, 113, 0.3)"}`
                            : "0 4px 12px rgba(0, 0, 0, 0.1)";
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "rgba(148,163,184,0.75)", fontSize: "0.75rem" }}>
                  <span>
                    Your pick:{" "}
                    <strong style={{ color: userPick ? "#f8fafc" : "rgba(148,163,184,0.8)" }}>
                      {userPick ? userPick.toUpperCase() : "—"}
                    </strong>
                  </span>
                  <span>{displayResolvedText}</span>
                </div>

                {market.previous && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.6rem 0.75rem",
                      borderRadius: 10,
                      background: "rgba(15, 118, 110, 0.15)",
                      border: "1px solid rgba(20, 184, 166, 0.25)",
                      color: "#99f6e4",
                      fontSize: "0.75rem",
                    }}
                  >
                    Prev session {market.previous.sessionId}: {market.previous.outcome.toUpperCase()} ·{" "}
                    {market.previous.winners}/{market.previous.participants || 1} picked correctly
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      {confirmChoice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 1100,
          }}
          onClick={() => {
            if (pendingMarket) return;
            setConfirmChoice(null);
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(99,102,241,0.35)",
              borderRadius: 16,
              padding: "1.5rem",
              color: "#e2e8f0",
              boxShadow: "0 18px 48px rgba(15,23,42,0.45)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Confirm prediction</h3>
              <button
                onClick={() => {
                  if (pendingMarket) return;
                  setConfirmChoice(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(148,163,184,0.8)",
                  cursor: pendingMarket ? "not-allowed" : "pointer",
                  fontSize: "1.35rem",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: "#f8fafc" }}>{confirmChoice.marketTitle}</div>
              <div style={{ marginTop: "0.65rem", color: "rgba(148,163,184,0.85)" }}>
                You&apos;re selecting{" "}
                <span
                  style={{
                    color: confirmChoice.side === "yes" ? "#4ade80" : "#f87171",
                    fontWeight: 700,
                  }}
                >
                  {confirmChoice.side.toUpperCase()}
                </span>{" "}
                ({confirmChoice.side === "yes" ? confirmChoice.yesLabel : confirmChoice.noLabel}).
              </div>
              <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "rgba(203,213,225,0.75)" }}>
                This choice will be locked for the rest of the session.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={() => {
                  if (pendingMarket) return;
                  setConfirmChoice(null);
                }}
                style={{
                  padding: "0.6rem 1.1rem",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "transparent",
                  color: "#cbd5f5",
                  fontWeight: 600,
                  cursor: pendingMarket ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={pendingMarket === confirmChoice.marketId}
                style={{
                  padding: "0.6rem 1.2rem",
                  borderRadius: 10,
                  border: "1px solid rgba(99,102,241,0.5)",
                  background:
                    pendingMarket === confirmChoice.marketId
                      ? "rgba(99,102,241,0.4)"
                      : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: pendingMarket === confirmChoice.marketId ? "not-allowed" : "pointer",
                }}
              >
                {pendingMarket === confirmChoice.marketId ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}