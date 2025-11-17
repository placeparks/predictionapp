"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  Gauge,
  LineChart,
  Loader2,
} from "lucide-react";

const MAX_LEVERAGE = Number(process.env.NEXT_PUBLIC_MAX_LEVERAGE || 10);
const API_SERIES = "/api/kalshi/series";
const API_MARKETS = "/api/leverage/markets";
const API_POSITIONS = "/api/leverage/positions";
const REFRESH_INTERVAL = 15_000;

type MarketStat = {
  market_id: string;
  market_ticker: string;
  market_title: string;
  yes_stake: number;
  no_stake: number;
  yes_weight: number;
  no_weight: number;
};

type KalshiSeries = {
  title: string;
  ticker?: string;
  milestones?: Array<{ id: string; title?: string; yes_bid?: number | null; no_bid?: number | null; close_time?: string | null }>;
};

type Position = {
  id: string;
  market_id: string;
  market_ticker: string | null;
  market_title: string | null;
  side_yes: boolean;
  stake_amount: number;
  leverage: number;
  weight: number;
  payout_amount?: number | null;
  pnl_amount?: number | null;
  settled: boolean;
  settled_at?: string | null;
  created_at: string;
};

type SelectedMarket = { ticker: string; title: string };

const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

export default function LeverageTradingPage() {
  const { address } = useAccount();
  const [betBalance, setBetBalance] = useState<number | null>(null);
  const [markets, setMarkets] = useState<MarketStat[]>([]);
  const [series, setSeries] = useState<KalshiSeries[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<SelectedMarket | null>(null);
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">("yes");
  const [stakeInput, setStakeInput] = useState("25");
  const [leverageInput, setLeverageInput] = useState(3);
  const [submitState, setSubmitState] = useState<{ loading: boolean; message: string | null; ok: boolean }>({
    loading: false,
    message: null,
    ok: false,
  });

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBetBalance(null);
      return;
    }
    try {
      const res = await fetch(`/api/points?user=${address}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const tokens =
        typeof json?.bet_tokens === "number"
          ? json.bet_tokens
          : typeof json?.points === "number"
          ? json.points
          : Number(json?.points) || 0;
      setBetBalance(tokens);
    } catch (err) {
      console.error("[leverage] balance fetch failed:", err);
    }
  }, [address]);

  const fetchMarkets = useCallback(async () => {
    try {
      setLoadingMarkets(true);
      const res = await fetch(API_MARKETS, { cache: "no-store" });
      const payload = await res.json();
      if (payload?.ok) setMarkets(payload.markets || []);
    } catch (err) {
      console.error("[leverage] market stats failed:", err);
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  const fetchSeries = useCallback(async () => {
    try {
      const res = await fetch(API_SERIES, { cache: "no-store" });
      const payload = await res.json();
      if (payload?.series) setSeries(payload.series.slice(0, 6));
    } catch (err) {
      console.error("[leverage] series fetch failed:", err);
    }
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!address) {
      setPositions([]);
      return;
    }
    try {
      setLoadingPositions(true);
      const res = await fetch(`${API_POSITIONS}?user=${address}`, { cache: "no-store" });
      const payload = await res.json();
      if (payload?.ok) setPositions(payload.positions || []);
    } catch (err) {
      console.error("[leverage] positions fetch failed:", err);
    } finally {
      setLoadingPositions(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchMarkets();
    const interval = setInterval(fetchMarkets, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  useEffect(() => {
    void fetchSeries();
  }, [fetchSeries]);

  useEffect(() => {
    void fetchBalance();
    void fetchPositions();
  }, [address, fetchBalance, fetchPositions]);

  useEffect(() => {
    if (!modalOpen) {
      setSubmitState({ loading: false, message: null, ok: false });
      setStakeInput("25");
      setLeverageInput(3);
    }
  }, [modalOpen]);

  const openModal = (market: SelectedMarket, side: "yes" | "no") => {
    setSelectedMarket(market);
    setSelectedSide(side);
    setModalOpen(true);
  };

  const handleTrade = async () => {
    if (!address) {
      setSubmitState({ loading: false, message: "Connect your wallet first.", ok: false });
      return;
    }
    if (!selectedMarket) {
      setSubmitState({ loading: false, message: "Select a market", ok: false });
      return;
    }
    const amount = Number(stakeInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setSubmitState({ loading: false, message: "Enter a valid stake", ok: false });
      return;
    }
    setSubmitState({ loading: true, message: null, ok: false });
    try {
      const res = await fetch(API_POSITIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: address,
          marketTicker: selectedMarket.ticker,
          marketTitle: selectedMarket.title,
          stakeAmount: amount,
          leverage: leverageInput,
          sideYes: selectedSide === "yes",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.message || payload?.error || `HTTP ${res.status}`);
      }
      setSubmitState({ loading: false, message: "Trade submitted", ok: true });
      void fetchBalance();
      void fetchPositions();
      setTimeout(() => setModalOpen(false), 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to place trade";
      setSubmitState({ loading: false, message, ok: false });
    }
  };

  const heroStats = useMemo(() => {
    const totalStake = markets.reduce((sum, m) => sum + m.yes_stake + m.no_stake, 0);
    return {
      totalStake,
      marketCount: markets.length,
    };
  }, [markets]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem 4rem",
        background: "radial-gradient(circle at top, rgba(255,215,0,0.08), rgba(10,10,26,1))",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: "2rem" }}>
        <section
          style={{
            display: "grid",
            gap: "1.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <span style={{ fontSize: "0.85rem", letterSpacing: "0.3rem", textTransform: "uppercase", color: "rgba(255,255,255,0.65)" }}>
              leverage trading
            </span>
            <h1 style={{ fontSize: "clamp(2.5rem,4vw,3.5rem)", fontWeight: 900, lineHeight: 1.1 }}>
              Boost conviction. Keep risk capped.
            </h1>
            <p style={{ fontSize: "1.05rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
              Stake USDC (vault credits), pick YES or NO, and select leverage up to 10x. Pools resolve with Kalshi as the oracle.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  if (series[0]?.milestones?.[0]) {
                    openModal(
                      {
                        ticker: series[0].milestones[0].id,
                        title: series[0].milestones[0].title || series[0].title,
                      },
                      "yes"
                    );
                  }
                }}
                style={{
                  padding: "0.85rem 1.5rem",
                  borderRadius: "999px",
                  background: "linear-gradient(130deg, #ffd700, #f97316)",
                  color: "#111",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Launch Trade
              </button>
              <Link
                href="/points"
                style={{
                  padding: "0.85rem 1.5rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Deposit USDC →
              </Link>
            </div>
          </div>
          <div
            style={{
              background: "rgba(16,16,40,0.9)",
              borderRadius: 24,
              padding: "1.5rem",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,0.65)" }}>Vault overview</p>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <div style={statPill}>
                <span>Total pooled</span>
                <strong>{formatNumber(heroStats.totalStake, 0)} USDC</strong>
              </div>
              <div style={statPill}>
                <span>Open markets</span>
                <strong>{heroStats.marketCount}</strong>
              </div>
            </div>
            <div style={statPill}>
              <span>Your vault balance</span>
              <strong>{betBalance !== null ? `${formatNumber(betBalance)} BET` : address ? "-" : "Connect wallet"}</strong>
            </div>
          </div>
        </section>

        <section
          style={{
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "1.5rem",
            background: "rgba(12,12,32,0.85)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LineChart size={20} color="#FFD700" />
            <div>
              <h2 style={{ margin: 0 }}>Open pools</h2>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.65)", fontSize: "0.9rem" }}>
                Live leverage vaults synced with Kalshi.
              </p>
            </div>
          </div>
          {loadingMarkets ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Loader2 className="spin" size={18} /> Loading pools...
            </div>
          ) : markets.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.7)" }}>No leverage trades yet.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1rem",
              }}
            >
              {markets.map((market) => {
                const totalStake = market.yes_stake + market.no_stake;
                const yesShare = totalStake ? (market.yes_stake / totalStake) * 100 : 0;
                const ticker = market.market_ticker || market.market_id;
                const title = market.market_title || ticker;
                return (
                  <article
                    key={market.market_id}
                    style={{
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "1rem",
                      background: "rgba(255,255,255,0.03)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.7rem",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0 }}>{title}</h3>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                        {ticker}
                      </p>
                    </div>
                    <div style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#10b981" }}>YES | {formatNumber(market.yes_weight, 1)} wt</span>
                      <span style={{ color: "#f97316" }}>NO | {formatNumber(market.no_weight, 1)} wt</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${yesShare}%`,
                          background: "linear-gradient(90deg, #10b981, #3b82f6)",
                          height: "100%",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button style={marketButton("#10b981")} onClick={() => openModal({ ticker, title }, "yes")}>
                        Long YES
                      </button>
                      <button style={marketButton("#f97316")} onClick={() => openModal({ ticker, title }, "no")}>
                        Long NO
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section
          style={{
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "1.5rem",
            background: "rgba(11,11,28,0.85)",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Gauge size={20} color="#FFD700" />
            <div>
              <h2 style={{ margin: 0 }}>Your leverage positions</h2>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.65)", fontSize: "0.9rem" }}>
                Track every stake, leverage multiple, and PnL.
              </p>
            </div>
          </div>
          {!address ? (
            <p style={{ color: "rgba(255,255,255,0.7)" }}>Connect your wallet to view trades.</p>
          ) : loadingPositions ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Loader2 className="spin" size={18} /> Loading positions...
            </div>
          ) : positions.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.7)" }}>No leverage trades yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {positions.map((pos) => {
                const ticker = pos.market_ticker || pos.market_id;
                const title = pos.market_title || ticker;
                const payout = pos.payout_amount || 0;
                const pnl = pos.pnl_amount || 0;
                return (
                  <div
                    key={pos.id}
                    style={{
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "1rem",
                      background: "rgba(255,255,255,0.02)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      justifyContent: "space-between",
                    }}
                    >
                      <div style={{ flex: "1 1 240px" }}>
                        <h3 style={{ margin: 0 }}>{title}</h3>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                          {ticker}
                        </p>
                      <p style={{ margin: 0, color: pos.side_yes ? "#10b981" : "#f97316" }}>
                        {pos.side_yes ? "YES" : "NO"} | {formatNumber(pos.stake_amount)} USDC | {pos.leverage}x
                      </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "rgba(255,255,255,0.7)" }}>
                        Weight: {formatNumber(pos.weight)}
                      </p>
                      {pos.settled ? (
                        <>
                          <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>Payout: {formatNumber(payout)} USDC</p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.85rem",
                              color: pnl >= 0 ? "#10b981" : "#f97316",
                              fontWeight: 600,
                            }}
                          >
                            PnL: {pnl >= 0 ? "+" : ""}
                            {formatNumber(pnl)} USDC
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#6366f1" }}>Open</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modalOpen && selectedMarket && (
        <div style={modalOverlay} onClick={() => setModalOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>{selectedMarket.ticker}</p>
                <h3 style={{ margin: "0.2rem 0 0.4rem" }}>{selectedMarket.title}</h3>
              </div>
              <button style={closeBtn} onClick={() => setModalOpen(false)}>
                x
              </button>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              {(["yes", "no"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setSelectedSide(side)}
                  style={{
                    flex: 1,
                    padding: "0.6rem",
                    borderRadius: 10,
                    border: selectedSide === side ? "1px solid rgba(255,215,0,0.8)" : "1px solid rgba(255,255,255,0.15)",
                    background: selectedSide === side ? "rgba(255,215,0,0.15)" : "transparent",
                    color: selectedSide === side ? "#FFD700" : "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {side === "yes" ? "Long YES" : "Long NO"}
                </button>
              ))}
            </div>
            <label style={modalLabel}>
              Stake (USDC)
              <input
                type="number"
                min={1}
                step="0.01"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                style={modalInput}
              />
            </label>
            <label style={modalLabel}>
              Leverage ({leverageInput}x)
              <input
                type="range"
                min={1}
                max={MAX_LEVERAGE}
                value={leverageInput}
                onChange={(e) => setLeverageInput(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </label>
            {submitState.message && (
              <p style={{ color: submitState.ok ? "#10b981" : "#f97316", fontSize: "0.9rem" }}>{submitState.message}</p>
            )}
            <button
              onClick={handleTrade}
              disabled={submitState.loading}
              style={{
                width: "100%",
                padding: "0.85rem",
                borderRadius: 12,
                border: "none",
                fontWeight: 700,
                background: submitState.loading ? "rgba(255,255,255,0.15)" : "rgba(99,102,241,0.85)",
                color: "#fff",
                cursor: submitState.loading ? "not-allowed" : "pointer",
                marginTop: "0.5rem",
              }}
            >
              {submitState.loading ? "Submitting..." : "Place leverage trade"}
            </button>
          </div>
        </div>
      )}

      <style>{`.spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </main>
  );
}

const statPill: React.CSSProperties = {
  flex: "1 1 140px",
  padding: "0.75rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

const marketButton = (color: string): React.CSSProperties => ({
  flex: 1,
  padding: "0.5rem 0.75rem",
  borderRadius: 10,
  border: `1px solid ${color}40`,
  background: "transparent",
  color,
  fontWeight: 600,
  cursor: "pointer",
});

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 1000,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "rgba(12,14,32,0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 20,
  padding: "1.5rem",
};

const closeBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.25)",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
};

const modalLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.85)",
  marginBottom: "0.75rem",
};

const modalInput: React.CSSProperties = {
  padding: "0.75rem",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
};
