"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { Copy, Check, Users, Trophy, Gift, Share2, Zap } from "lucide-react";

interface ReferralData {
  referrer: {
    total: number;
    active: number;
    referrals: Array<{
      id: string;
      referred_address: string;
      created_at: string;
      first_bet_at: string | null;
      active_at: string | null;
      is_active: boolean;
      referrer_rewarded: boolean;
      referred_rewarded: boolean;
    }>;
  };
  referred: {
    referrer_address: string;
    created_at: string;
    is_active: boolean;
  } | null;
  genesis: {
    is_genesis: boolean;
    genesis_ring_unlocked: boolean;
    active_referral_streak: number;
    genesis_ring_unlocked_at: string | null;
  } | null;
  referralCodes?: Array<{
    code: string;
    created_at: string;
    usage_count: number;
    is_active: boolean;
    last_used_at: string | null;
  }>;
  primaryCode?: string | null;
  referralLink: string;
}

export default function ReferralsPage() {
  const { address } = useAccount();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const fetchData = useCallback(async () => {
    if (!address) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/referrals?user=${address}`);
      const json = await res.json();
      if (json.ok) {
        setData(json);
      } else {
        setError(json.error || "Failed to fetch referral data");
      }
    } catch (err) {
      console.error("Failed to fetch referrals:", err);
      setError("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const copyToClipboard = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareLink = async () => {
    if (!data?.referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join PROPHECY - Make Predictions, Earn Rewards!",
          text: "Join me on PROPHECY and start making predictions! Use my referral link to get 50 BET tokens when you sign up.",
          url: data.referralLink,
        });
      } catch (err) {
        // User cancelled or error
        console.error("Share failed:", err);
      }
    } else {
      // Fallback to copy
      await copyToClipboard();
    }
  };

  const generateReferralCode = async () => {
    if (!address) return;
    
    setGeneratingCode(true);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          creator: address,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        // Refresh data to show new code
        await fetchData();
      } else {
        setError(json.error || "Failed to generate referral code");
      }
    } catch (err) {
      console.error("Failed to generate code:", err);
      setError("Failed to generate referral code. Please try again.");
    } finally {
      setGeneratingCode(false);
    }
  };

  if (!address) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: '#fff'
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Referrals</h1>
        <p style={{ fontSize: '1.125rem', color: 'rgba(255,255,255,0.7)' }}>
          Connect your wallet to view your referral status
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: '#fff'
      }}>
        <p>Loading referral data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: '#fff'
      }}>
        <p style={{ color: '#ef4444' }}>Error: {error}</p>
      </div>
    );
  }

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
        overflow: 'hidden'
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
      maxWidth: '1200px',
      position: 'relative',
      zIndex: 1,
      margin: '0 auto',
      padding: '2rem 1.5rem',
      minHeight: 'calc(100vh - 200px)'
    }}>
      <h1 style={{
        fontSize: '2.5rem',
        fontWeight: 800,
        color: '#fff',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        Referrals & Rewards
      </h1>

      {/* Referral Link Section */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        backdropFilter: 'blur(10px)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#fff',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <Gift size={24} color="#FFD700" />
          Your Referral Link
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1rem' }}>
          Share this link to earn 100 BET tokens for each friend who signs up and starts betting!
        </p>
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '1rem'
        }}>
          <div style={{
            flex: 1,
            minWidth: '200px',
            padding: '0.875rem 1rem',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '0.875rem',
            wordBreak: 'break-all'
          }}>
            {data?.referralLink || "Loading..."}
          </div>
          <button
            onClick={copyToClipboard}
            style={{
              padding: '0.875rem 1.5rem',
              background: copied ? '#10b981' : 'rgba(99, 102, 241, 0.8)',
              border: '1px solid rgba(99, 102, 241, 0.5)',
              borderRadius: '12px',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={shareLink}
            style={{
              padding: '0.875rem 1.5rem',
              background: 'rgba(255, 215, 0, 0.2)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              borderRadius: '12px',
              color: '#FFD700',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Share2 size={18} />
            Share
          </button>
        </div>
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem'
          }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: '#fff',
              margin: 0
            }}>
              Your Referral Codes
            </h3>
            <button
              onClick={generateReferralCode}
              disabled={generatingCode}
              style={{
                padding: '0.625rem 1.25rem',
                background: generatingCode ? 'rgba(255,255,255,0.2)' : 'linear-gradient(135deg, #FFD700, #FFA500)',
                border: '1px solid rgba(255, 215, 0, 0.5)',
                borderRadius: '10px',
                color: generatingCode ? 'rgba(255,255,255,0.6)' : '#000',
                fontWeight: 600,
                cursor: generatingCode ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                transition: 'all 0.2s'
              }}
            >
              {generatingCode ? "Generating..." : "+ Generate New Code"}
            </button>
          </div>
          {data?.referralCodes && data.referralCodes.length > 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              {data.referralCodes.map((code) => (
                <div
                  key={code.code}
                  style={{
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#FFD700',
                      marginBottom: '0.25rem',
                      fontFamily: 'monospace'
                    }}>
                      {code.code}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.6)'
                    }}>
                      Created: {new Date(code.created_at).toLocaleDateString()} • 
                      Used: {code.usage_count} time{code.usage_count !== 1 ? 's' : ''}
                      {code.last_used_at && ` • Last used: ${new Date(code.last_used_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center'
                  }}>
                    {code.is_active ? (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                        borderRadius: '8px',
                        color: '#22c55e',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        Active
                      </span>
                    ) : (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '8px',
                        color: '#ef4444',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.875rem',
              fontStyle: 'italic'
            }}>
              No referral codes yet. Generate one to get started!
            </p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* Total Referrals */}
        <div style={{
          background: 'rgba(99, 102, 241, 0.15)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '16px',
          padding: '1.5rem',
          textAlign: 'center'
        }}>
          <Users size={32} color="#6366f1" style={{ marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
            {data?.referrer.total || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
            Total Referrals
          </div>
        </div>

        {/* Active Referrals */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '16px',
          padding: '1.5rem',
          textAlign: 'center'
        }}>
          <Zap size={32} color="#10b981" style={{ marginBottom: '0.5rem' }} />
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
            {data?.referrer.active || 0}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
            Active Referrals
          </div>
        </div>

        {/* Genesis Ring Status */}
        {data?.genesis?.is_genesis && (
          <div style={{
            background: data.genesis.genesis_ring_unlocked 
              ? 'rgba(255, 215, 0, 0.2)' 
              : 'rgba(255, 255, 255, 0.1)',
            border: `1px solid ${data.genesis.genesis_ring_unlocked ? 'rgba(255, 215, 0, 0.4)' : 'rgba(255, 255, 255, 0.2)'}`,
            borderRadius: '16px',
            padding: '1.5rem',
            textAlign: 'center'
          }}>
            <Trophy size={32} color={data.genesis.genesis_ring_unlocked ? "#FFD700" : "#fff"} style={{ marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '2rem', fontWeight: 800, color: data.genesis.genesis_ring_unlocked ? "#FFD700" : "#fff", marginBottom: '0.25rem' }}>
              {data.genesis.genesis_ring_unlocked ? "🔓" : "🔒"}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>
              {data.genesis.genesis_ring_unlocked ? "Genesis Ring Unlocked!" : "Genesis Ring Locked"}
            </div>
            {!data.genesis.genesis_ring_unlocked && (
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.5rem' }}>
                {data.genesis.active_referral_streak}/5 active referrals
              </div>
            )}
          </div>
        )}
      </div>

      {/* Referred By Section */}
      {data?.referred && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '20px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
            You were referred by
          </h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
            {data.referred.referrer_address.slice(0, 6)}...{data.referred.referrer_address.slice(-4)}
          </p>
          {data.referred.is_active && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.5rem 1rem',
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '8px',
              color: '#10b981',
              fontSize: '0.875rem',
              display: 'inline-block'
            }}>
              ✓ Active (betting for 3+ days)
            </div>
          )}
        </div>
      )}

      {/* Referrals List */}
      {data?.referrer.referrals && data.referrer.referrals.length > 0 && (
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '20px',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>
            Your Referrals
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.referrer.referrals.map((ref) => (
              <div
                key={ref.id}
                style={{
                  padding: '1rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}
              >
                <div>
                  <div style={{ color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {ref.referred_address.slice(0, 6)}...{ref.referred_address.slice(-4)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                    Referred {new Date(ref.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {ref.is_active ? (
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '6px',
                      color: '#10b981',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      Active
                    </span>
                  ) : ref.first_bet_at ? (
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      background: 'rgba(255, 215, 0, 0.2)',
                      border: '1px solid rgba(255, 215, 0, 0.4)',
                      borderRadius: '6px',
                      color: '#FFD700',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      Pending
                    </span>
                  ) : (
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '6px',
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: '0.75rem'
                    }}>
                      No bets yet
                    </span>
                  )}
                  {ref.referrer_rewarded && (
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      borderRadius: '6px',
                      color: '#6366f1',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      +100 BET
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Genesis Ring Info */}
      {data?.genesis?.is_genesis && (
        <div style={{
          background: 'rgba(255, 215, 0, 0.1)',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginTop: '2rem'
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFD700', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trophy size={20} /> Genesis Ring
          </h3>
          {data.genesis.genesis_ring_unlocked ? (
            <div>
              <p style={{ color: '#fff', marginBottom: '0.5rem' }}>
                🎉 Congratulations! You&apos;ve unlocked the Genesis Ring!
              </p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
                You now earn <strong style={{ color: '#FFD700' }}>3x BET tokens</strong> on all your wins! 
                This multiplier applies to Base Daily predictions and all other BET token rewards.
              </p>
              {data.genesis.genesis_ring_unlocked_at && (
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  Unlocked: {new Date(data.genesis.genesis_ring_unlocked_at).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p style={{ color: '#fff', marginBottom: '0.5rem' }}>
                Unlock the Genesis Ring by getting 5 active referrals!
              </p>
              <div style={{
                marginTop: '1rem',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '8px',
                padding: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)' }}>Active Referrals</span>
                  <span style={{ color: '#FFD700', fontWeight: 700 }}>
                    {data.genesis.active_referral_streak} / 5
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(data.genesis.active_referral_streak / 5) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #FFD700, #FFA500)',
                    transition: 'width 0.3s'
                  }} />
                </div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  An active referral is someone who has been betting for more than 3 days
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}


