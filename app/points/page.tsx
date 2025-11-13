"use client";
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAccount, useChainId, useSwitchChain, useWriteContract, usePublicClient } from "wagmi";
import { Zap, Coins, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const USDC_DECIMALS = 6;
const ERROR_AUTO_CLEAR_MS = 5000;

const ERC20_ABI = [
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

const ERC4626_ABI = [
  { inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], name: "deposit", outputs: [{ name: "shares", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
] as const;

// Style constants
const STYLES = {
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    minHeight: 'calc(100vh - 200px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Georgia", "Times New Roman", "Times", serif'
  },
  card: {
    width: '100%',
    maxWidth: 640,
    padding: '2rem',
    color: '#fff',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    backdropFilter: 'blur(10px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
  },
  input: {
    flex: 1,
    padding: '0.875rem 1rem',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    minHeight: '48px',
    fontSize: '1rem',
    transition: 'all 0.2s',
    outline: 'none'
  },
  inputFocus: {
    borderColor: 'rgba(99, 102, 241, 0.6)',
    background: 'rgba(255,255,255,0.15)',
    boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)'
  },
  button: {
    padding: '0.875rem 1.5rem',
    borderRadius: 12,
    color: '#fff',
    fontWeight: 700,
    minHeight: '48px',
    fontSize: '0.875rem',
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.2s',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  buttonPrimary: {
    background: 'rgba(99, 102, 241, 0.8)',
    border: '1px solid rgba(99, 102, 241, 0.5)'
  },
  buttonDisabled: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'not-allowed',
    opacity: 0.5
  },
  statusBox: {
    marginTop: '1rem',
    padding: '0.875rem 1rem',
    borderRadius: 12,
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  statusInfo: {
    background: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid rgba(99, 102, 241, 0.4)',
    color: '#fff'
  },
  statusSuccess: {
    background: 'rgba(34, 197, 94, 0.2)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    color: '#fff'
  },
  statusError: {
    background: 'rgba(245,87,108,0.2)',
    border: '1px solid rgba(245,87,108,0.5)',
    color: '#fff',
    justifyContent: 'space-between'
  },
  pointsDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem',
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: 12,
    marginBottom: '1.5rem'
  }
} as const;

export default function PointsPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const [betTokens, setBetTokens] = useState<number | null>(null);
  const [amountUSDC, setAmountUSDC] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const expectedChainId = useMemo(() => parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532", 10), []);
  const VAULT = useMemo(() => (process.env.NEXT_PUBLIC_FORECAST_VAULT_ADDRESS || "0x7cba78EF2CB282286B11DaD65249c1b00e5e8C0F") as `0x${string}` , []);
  const USDC = useMemo(() => (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}` , []);
  const POINTS_PER_USDC = useMemo(() => Number(process.env.NEXT_PUBLIC_POINTS_PER_USDC || process.env.POINTS_PER_USDC || 10), []);

  const refresh = useCallback(async () => {
    setStatus(null); setError(null);
    if (!address) { setBetTokens(null); return; }
    try {
      const r = await fetch(`/api/points?user=${address}`);
      const j = await r.json().catch(() => ({}));
      const tokens = typeof j?.bet_tokens === 'number' ? j.bet_tokens : (typeof j?.points === 'number' ? j.points : Number(j?.points) || 0);
      setBetTokens(tokens);
    } catch (err) {
      console.error("Failed to fetch BET tokens:", err);
    }
  }, [address]);

  useEffect(() => { 
    void refresh(); 
  }, [refresh]);

  // Listen for bet-tokens-updated events (backward compatible with points-updated)
  useEffect(() => {
    const handleTokensUpdate = (event: CustomEvent) => {
      if (event.detail?.address?.toLowerCase() === address?.toLowerCase()) {
        refresh();
      }
    };
    window.addEventListener('bet-tokens-updated', handleTokensUpdate as EventListener);
    window.addEventListener('points-updated', handleTokensUpdate as EventListener); // Backward compatibility
    return () => {
      window.removeEventListener('bet-tokens-updated', handleTokensUpdate as EventListener);
      window.removeEventListener('points-updated', handleTokensUpdate as EventListener);
    };
  }, [address, refresh]);

  // Cleanup error timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  const toUnits = useCallback((amount: string): bigint => {
    const [intPart, fracPartRaw] = amount.split(".");
    const fracPart = (fracPartRaw || "").padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
    const full = `${intPart || "0"}${fracPart}`.replace(/^0+/, "") || "0";
    return BigInt(full);
  }, []);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmountUSDC(value);
    }
  }, []);

  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    setError(null);
  }, []);

  const buyPoints = useCallback(async () => {
    try {
      setStatus(null); 
      clearError();
      setIsProcessing(true);
      
      if (!address) { 
        setError("Connect wallet"); 
        return; 
      }
      
      const amtNum = Number(amountUSDC);
      if (!Number.isFinite(amtNum) || amtNum <= 0) { 
        setError("Enter valid USDC amount"); 
        return; 
      }

      if (chainId !== expectedChainId && switchChain) {
        try {
          setStatus("Switching network...");
          await switchChain({ chainId: expectedChainId });
        } catch {
          setError("Please switch to the correct network");
          return;
        }
      }

      const amt = toUnits(amountUSDC);

      if (!publicClient) { 
        setError("No public client"); 
        return; 
      }

      setStatus("Approving USDC...");
      const approveHash = await writeContractAsync({ 
        address: USDC, 
        abi: ERC20_ABI, 
        functionName: "approve", 
        args: [VAULT, amt] 
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setStatus("Depositing to vault...");
      const depositHash = await writeContractAsync({ 
        address: VAULT, 
        abi: ERC4626_ABI, 
        functionName: "deposit", 
        args: [amt, address as `0x${string}`] 
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      setStatus("Crediting BET tokens...");
      const tokensToAdd = Math.floor(amtNum * POINTS_PER_USDC);
      const r = await fetch("/api/points/purchase", { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ address, amount: tokensToAdd }) 
      });
      const j = await r.json();
      if (!r.ok) { 
        throw new Error(j?.error || "Failed to credit BET tokens"); 
      }

      setStatus("BET tokens added successfully!");
      setAmountUSDC("");
      
      // Dispatch bet-tokens-updated event (and points-updated for backward compatibility)
      window.dispatchEvent(new CustomEvent('bet-tokens-updated', { 
        detail: { address, bet_tokens: (betTokens ?? 0) + tokensToAdd } 
      }));
      window.dispatchEvent(new CustomEvent('points-updated', { 
        detail: { address, points: (betTokens ?? 0) + tokensToAdd } 
      }));
      
      await refresh();
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setStatus(null);
      }, 3000);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Purchase failed";
      // Don't show error for user rejections - they're not errors, just user actions
      if (errorMsg.includes("User rejected") || errorMsg.includes("User denied") || errorMsg.includes("rejected the request")) {
        // Silently ignore user rejections
        setStatus(null);
        setError(null);
      } else {
        setError(errorMsg);
        // Auto-clear error after 5 seconds
        if (errorTimeoutRef.current) {
          clearTimeout(errorTimeoutRef.current);
        }
        errorTimeoutRef.current = setTimeout(() => {
          setError(null);
          errorTimeoutRef.current = null;
        }, ERROR_AUTO_CLEAR_MS);
      }
    } finally { 
      setIsProcessing(false); 
    }
  }, [address, amountUSDC, chainId, expectedChainId, switchChain, toUnits, publicClient, writeContractAsync, USDC, VAULT, POINTS_PER_USDC, refresh, betTokens, clearError]);

  const inputStyle = useMemo(() => ({
    ...STYLES.input,
    ...(inputFocused ? STYLES.inputFocus : {})
  }), [inputFocused]);

  const buttonStyleDynamic = useMemo(() => ({
    ...STYLES.button,
    ...(isProcessing ? STYLES.buttonDisabled : STYLES.buttonPrimary)
  }), [isProcessing]);

  const addressInfo = useMemo(() => (
    `Vault: ${VAULT.slice(0,6)}...${VAULT.slice(-4)} • USDC: ${USDC.slice(0,6)}...${USDC.slice(-4)}`
  ), [VAULT, USDC]);

  const buyButtonText = useMemo(() => 
    isProcessing ? 'Processing...' : `Buy BET Tokens`,
    [isProcessing]
  );

  const estimatedTokens = useMemo(() => {
    const amt = Number(amountUSDC);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    return Math.floor(amt * POINTS_PER_USDC);
  }, [amountUSDC, POINTS_PER_USDC]);

  const isButtonDisabled = useMemo(() => 
    isProcessing || !amountUSDC || Number(amountUSDC) <= 0 || !isConnected,
    [isProcessing, amountUSDC, isConnected]
  );

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
    <main style={{...STYLES.main, position: 'relative', zIndex: 1}}>
      <div style={STYLES.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <Coins size={32} color="#6366f1" />
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Buy BET Tokens</h1>
        </div>

        {!isConnected ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <Zap size={48} color="rgba(255,255,255,0.5)" style={{ marginBottom: '1rem' }} />
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem' }}>
              Connect your wallet to buy BET tokens
            </p>
          </div>
        ) : (
          <>
            <div style={STYLES.pointsDisplay}>
              <Zap size={20} color="#6366f1" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.25rem' }}>
                  Your BET Tokens
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
                  {betTokens ?? 0}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontSize: '0.875rem', 
                color: 'rgba(255,255,255,0.8)',
                fontWeight: 600
              }}>
                Amount (USDC)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch', flexDirection: 'column' }}>
                <input 
                  type="text"
                  placeholder="0.00" 
                  value={amountUSDC} 
                  onChange={handleAmountChange}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  inputMode="decimal" 
                  style={inputStyle}
                  disabled={isProcessing}
                  aria-label="USDC amount"
                />
                {estimatedTokens !== null && (
                  <div style={{
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    borderRadius: 8,
                    fontSize: '0.875rem',
                    color: 'rgba(255,255,255,0.8)',
                    textAlign: 'center'
                  }}>
                    ≈ {estimatedTokens} BET tokens
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={buyPoints} 
              disabled={isButtonDisabled} 
              style={buttonStyleDynamic}
              aria-label="Buy BET tokens"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Processing...
                </>
              ) : (
                <>
                  <Coins size={16} />
                  {buyButtonText}
                </>
              )}
            </button>

            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: 'rgba(255,255,255,0.05)', 
              borderRadius: 8,
              fontSize: '0.75rem', 
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.5
            }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Rate:</strong> {POINTS_PER_USDC} BET tokens per 1 USDC
              </div>
              <div style={{ fontSize: '0.7rem', marginTop: '0.5rem' }}>
                {addressInfo}
              </div>
            </div>

            {status && (
              <div style={{ 
                ...STYLES.statusBox,
                ...(status.includes('success') ? STYLES.statusSuccess : STYLES.statusInfo)
              }}>
                {status.includes('success') ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                )}
                <span>{status}</span>
              </div>
            )}

            {error && (
              <div style={{ 
                ...STYLES.statusBox,
                ...STYLES.statusError
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
                <button 
                  onClick={clearError} 
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: 'rgba(255,255,255,0.8)', 
                    cursor: 'pointer', 
                    fontSize: '1.25rem', 
                    padding: '0',
                    lineHeight: 1,
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  aria-label="Close error"
                >
                  ×
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 640px) {
          .points-main {
            padding: 1rem !important;
          }
          .points-card {
            padding: 1.5rem !important;
          }
        }
      `}</style>
    </main>
    </>
  );
}

