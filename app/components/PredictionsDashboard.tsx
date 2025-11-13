"use client";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

interface Prediction {
  id: string;
  user_address: string;
  vault_id: number;
  period_id: number;
  market_id: string;
  market_title?: string | null;
  market_ticker?: string | null;
  side_yes: boolean;
  stake_points: number;
  nonce: number;
  deadline: number;
  signature: string;
  created_at: string;
  settled?: boolean;
  settled_at?: string | null;
  won?: boolean | null;
}

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

const createMessageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface PredictionsDashboardProps {
  address?: string;
}

export default function PredictionsDashboard({ address }: PredictionsDashboardProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [betTokens, setBetTokens] = useState<number | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: createMessageId(),
      role: "assistant",
      content:
        "Hi! I'm your Kalshi Portfolio Copilot. Ask me about what traders are backing, how your positions compare, or where YES vs NO sentiment is shifting.",
      createdAt: Date.now(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const chatMessagesRef = useRef<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  chatMessagesRef.current = chatMessages;

  const [activeTab, setActiveTab] = useState<"overview" | "copilot">("overview");

  const quickPrompts = useMemo(
    () => [
      "Give me a pulse on where Kalshi and our app traders are leaning right now.",
      "How does my portfolio look compared to the crowd?",
      "Which markets have the biggest YES or NO tilt today?",
    ],
    []
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || chatLoading) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };

      const history = [
        ...chatMessagesRef.current.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user" as ChatRole, content: trimmed },
      ];

      setChatMessages((prev) => [...prev, userMessage]);
      setChatInput("");
      setChatLoading(true);
      setChatError(null);

      try {
        const res = await fetch("/api/portfolio-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            messages: history,
          }),
        });

        type PortfolioAgentResponse = { message?: string; error?: string };
        let payload: PortfolioAgentResponse | null = null;
        try {
          const json = await res.json();
          payload = json as PortfolioAgentResponse;
        } catch {
          payload = null;
        }

        if (!res.ok) {
          const detail =
            (payload?.message && String(payload.message)) ||
            (payload?.error && String(payload.error)) ||
            "Portfolio copilot is unavailable right now.";
          throw new Error(detail);
        }

        if (!payload) {
          throw new Error("Portfolio copilot is unavailable right now.");
        }

        const reply =
          typeof payload.message === "string" && payload.message.trim().length > 0
            ? payload.message.trim()
            : "I could not generate a response from the latest market data.";

        const assistantMessage: ChatMessage = {
          id: createMessageId(),
          role: "assistant",
          content: reply,
          createdAt: Date.now(),
        };

        setChatMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unexpected copilot error.";
        setChatError(message);
        setChatMessages((prev) => [
          ...prev,
          {
            id: createMessageId(),
            role: "assistant",
            content: `I ran into an issue pulling the latest market data: ${message}`,
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setChatLoading(false);
      }
    },
    [address, chatLoading]
  );

  const fetchPredictions = useCallback(async () => {
    if (!address) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/predictions?user=${address}`);
      if (!res.ok) {
        throw new Error("Failed to fetch predictions");
      }
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load predictions";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchBetTokens = useCallback(async () => {
    if (!address) {
      setBetTokens(null);
      return;
    }
    try {
      const res = await fetch(`/api/points?user=${address}`);
      if (!res.ok) return;
      const data = await res.json();
      const tokens = typeof data?.bet_tokens === 'number' ? data.bet_tokens : (typeof data?.points === 'number' ? data.points : Number(data?.points) || 0);
      setBetTokens(tokens);
    } catch (err) {
      console.error("Failed to fetch BET tokens:", err);
    }
  }, [address]);

  useEffect(() => {
    void fetchBetTokens();
  }, [fetchBetTokens]);

  useEffect(() => {
    void fetchPredictions();
  }, [fetchPredictions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  if (!address) {
    return (
      <div
        style={{
          background: "rgba(15, 20, 35, 0.6)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: 16,
          padding: "3rem",
          textAlign: "center",
          backdropFilter: "blur(10px)",
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.6)", margin: 0 }}>
          Connect your wallet to view your predictions
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          background: "rgba(15, 20, 35, 0.6)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          borderRadius: 16,
          padding: "3rem",
          textAlign: "center",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid rgba(99, 102, 241, 0.3)",
            borderTop: "3px solid #6366f1",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 1rem",
          }}
        />
        <p style={{ color: "rgba(255,255,255,0.6)", margin: 0 }}>Loading predictions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.4)",
          borderRadius: 16,
          padding: "1.5rem",
          backdropFilter: "blur(10px)",
        }}
      >
        <p style={{ color: "#ef4444", margin: 0 }}>Error: {error}</p>
      </div>
    );
  }

  const settledPredictions = predictions.filter((prediction) => prediction.settled);
  const pendingPredictions = predictions.filter((prediction) => !prediction.settled);
  const wonPredictions = settledPredictions.filter((prediction) => prediction.won === true);
  const lostPredictions = settledPredictions.filter((prediction) => prediction.won === false);

  return (
    <>
      <style>{`
        @media (max-width: 640px) {
          .dashboard-stats {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 0.75rem !important;
          }
          .dashboard-stats > div {
            padding: 1rem !important;
          }
          .dashboard-stats > div > div:last-child {
            font-size: 1.5rem !important;
          }
          .dashboard-prediction-card {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.75rem !important;
          }
          .dashboard-prediction-card > div:last-child {
            text-align: left !important;
            width: 100% !important;
          }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "rgba(15, 20, 35, 0.7)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: 999,
            padding: "0.35rem",
            backdropFilter: "blur(12px)",
            width: "fit-content",
          }}
        >
          {[
            { key: "overview" as const, label: "Predictions" },
            { key: "copilot" as const, label: "Portfolio Copilot" },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "0.6rem 1.4rem",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  background: isActive
                    ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                    : "transparent",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.65)",
                  boxShadow: isActive ? "0 6px 18px rgba(99, 102, 241, 0.35)" : "none",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "overview" ? (
          <>
            <div
              className="dashboard-stats"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
              }}
            >
              <div
                style={{
                  background: "rgba(15, 20, 35, 0.6)",
                  border: "1px solid rgba(255, 215, 0, 0.3)",
                  borderRadius: 16,
                  padding: "1.25rem",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "0.5rem",
                  }}
                >
                  BET Tokens
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#ffd700" }}>
                  {betTokens !== null ? betTokens.toLocaleString() : "—"}
                </div>
              </div>
              <div
                style={{
                  background: "rgba(15, 20, 35, 0.6)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: 16,
                  padding: "1.25rem",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Total Predictions
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#fff" }}>
                  {predictions.length}
                </div>
              </div>
              <div
                style={{
                  background: "rgba(15, 20, 35, 0.6)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  borderRadius: 16,
                  padding: "1.25rem",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Won
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#10b981" }}>
                  {wonPredictions.length}
                </div>
              </div>
              <div
                style={{
                  background: "rgba(15, 20, 35, 0.6)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  borderRadius: 16,
                  padding: "1.25rem",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Lost
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#ef4444" }}>
                  {lostPredictions.length}
                </div>
              </div>
              <div
                style={{
                  background: "rgba(15, 20, 35, 0.6)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: 16,
                  padding: "1.25rem",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.6)",
                    marginBottom: "0.5rem",
                  }}
                >
                  Pending
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#6366f1" }}>
                  {pendingPredictions.length}
                </div>
              </div>
            </div>

            <div
              style={{
                background: "rgba(15, 20, 35, 0.6)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                borderRadius: 16,
                padding: "1.5rem",
                backdropFilter: "blur(10px)",
              }}
            >
              <h2
                style={{
                  margin: "0 0 1rem 0",
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "#fff",
                }}
              >
                Your Predictions
              </h2>

              {predictions.length === 0 ? (
                <div
                  style={{
                    padding: "3rem",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  <p style={{ margin: 0 }}>No predictions yet. Start betting on markets!</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {predictions.map((prediction) => {
                    const isSettled = prediction.settled;
                    const won = prediction.won;
                    const side = prediction.side_yes ? "YES" : "NO";
                    const sideColor = prediction.side_yes ? "#10b981" : "#ef4444";

                    return (
                      <div
                        key={prediction.id}
                        className="dashboard-prediction-card"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid ${
                            isSettled
                              ? won
                                ? "rgba(16, 185, 129, 0.3)"
                                : "rgba(239, 68, 68, 0.3)"
                              : "rgba(99, 102, 241, 0.2)"
                          }`,
                          borderRadius: 12,
                          padding: "1rem",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "1rem",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={(event) => {
                          event.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          event.currentTarget.style.transform = "translateX(4px)";
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.background = "rgba(255,255,255,0.03)";
                          event.currentTarget.style.transform = "translateX(0)";
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              marginBottom: "0.5rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <div
                              style={{
                                padding: "0.25rem 0.75rem",
                                borderRadius: 6,
                                background: `rgba(${prediction.side_yes ? "16, 185, 129" : "239, 68, 68"}, 0.15)`,
                                border: `1px solid ${sideColor}40`,
                                color: sideColor,
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                              }}
                            >
                              {side}
                            </div>
                            {isSettled && (won ? <CheckCircle2 size={16} color="#10b981" /> : <XCircle size={16} color="#ef4444" />)}
                            {!isSettled && <Clock size={16} color="#6366f1" />}
                          </div>
                          <div
                            style={{
                              fontSize: "0.95rem",
                              color: "#fff",
                              fontWeight: 600,
                              marginBottom: "0.5rem",
                              lineHeight: 1.4,
                              wordBreak: "break-word",
                            }}
                          >
                            {prediction.market_title ||
                              prediction.market_ticker ||
                              `Market: ${prediction.market_id.slice(0, 10)}...`}
                          </div>
                          {prediction.market_ticker && prediction.market_title && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "rgba(255,255,255,0.5)",
                                marginBottom: "0.25rem",
                                fontFamily: "monospace",
                              }}
                            >
                              {prediction.market_ticker}
                            </div>
                          )}
                          <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>
                            {new Date(prediction.created_at).toLocaleString()}
                            {isSettled && prediction.settled_at && (
                              <> - Settled: {new Date(prediction.settled_at).toLocaleString()}</>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: "1.25rem",
                              fontWeight: 800,
                              color: "#fff",
                              marginBottom: "0.25rem",
                            }}
                          >
                            {prediction.stake_points} BET tokens
                          </div>
                          {isSettled && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: won ? "#10b981" : "#ef4444",
                                fontWeight: 600,
                              }}
                            >
                              {won ? "Won" : "Lost"}
                            </div>
                          )}
                          {!isSettled && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#6366f1",
                                fontWeight: 600,
                              }}
                            >
                              Pending
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div
            style={{
              background: "rgba(15, 20, 35, 0.7)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: 16,
              padding: "1.5rem",
              backdropFilter: "blur(12px)",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
                Portfolio Copilot
              </h2>
                        </div>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.7)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Chat with an AI researcher that examines Kalshi market feeds and our in-app predictions. It only answers
              questions related to this portfolio experience, market tilts, and trading sentiment.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    void sendMessage(prompt);
                  }}
                  disabled={chatLoading}
                  style={{
                    padding: "0.5rem 0.85rem",
                    borderRadius: 999,
                    border: "1px solid rgba(99, 102, 241, 0.4)",
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#fff",
                    fontSize: "0.8rem",
                    cursor: chatLoading ? "not-allowed" : "pointer",
                    opacity: chatLoading ? 0.5 : 1,
                    transition: "transform 0.15s ease, opacity 0.15s ease",
                  }}
                  onMouseOver={(event) => {
                    if (!chatLoading) {
                      event.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseOut={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(99, 102, 241, 0.25)",
                borderRadius: 14,
                padding: "1rem",
                maxHeight: "320px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    display: "flex",
                    justifyContent: message.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      background:
                        message.role === "user" ? "rgba(99, 102, 241, 0.35)" : "rgba(255,255,255,0.05)",
                      border:
                        message.role === "user"
                          ? "1px solid rgba(99, 102, 241, 0.5)"
                          : "1px solid rgba(148, 163, 184, 0.3)",
                      borderRadius: message.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                      padding: "0.75rem 1rem",
                      color: "#fff",
                      fontSize: "0.85rem",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      boxShadow: "0 4px 12px rgba(15, 20, 35, 0.35)",
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      borderRadius: 12,
                      padding: "0.5rem 0.75rem",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        border: "2px solid rgba(99, 102, 241, 0.3)",
                        borderTopColor: "#6366f1",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    <span>Analyzing latest markets...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            {chatError && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#fca5a5",
                  borderRadius: 12,
                  padding: "0.75rem 1rem",
                  fontSize: "0.8rem",
                }}
              >
                {chatError}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(chatInput);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask about trending markets, portfolio tilts, or where traders are staking BET tokens..."
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(chatInput);
                  }
                }}
                style={{
                  width: "100%",
                  minHeight: "80px",
                  maxHeight: "180px",
                  borderRadius: 14,
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                  background: "rgba(15, 20, 35, 0.65)",
                  color: "#fff",
                  padding: "0.85rem 1rem",
                  fontSize: "0.9rem",
                  lineHeight: 1.5,
                  resize: "vertical",
                  outline: "none",
                  boxShadow: "0 4px 10px rgba(0, 0, 0, 0.25)",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={chatLoading || chatInput.trim().length === 0}
                  style={{
                    background: chatLoading ? "rgba(99, 102, 241, 0.4)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    border: "none",
                    borderRadius: 999,
                    color: "#fff",
                    fontWeight: 600,
                    padding: "0.65rem 1.6rem",
                    fontSize: "0.9rem",
                    cursor:
                      chatLoading || chatInput.trim().length === 0 ? "not-allowed" : "pointer",
                    opacity: chatLoading || chatInput.trim().length === 0 ? 0.6 : 1,
                    transition: "transform 0.15s ease, opacity 0.15s ease",
                  }}
                  onMouseDown={(event) => {
                    if (!chatLoading && chatInput.trim().length > 0) {
                      event.currentTarget.style.transform = "scale(0.98)";
                    }
                  }}
                  onMouseUp={(event) => {
                    event.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  {chatLoading ? "Thinking..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
