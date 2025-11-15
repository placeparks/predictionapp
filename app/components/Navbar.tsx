"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import dynamic from "next/dynamic";

// Dynamically import ConnectWallet
const DynamicConnectWallet = dynamic(async () => {
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    const mod = await import("@coinbase/onchainkit/wallet");
    return mod.ConnectWallet;
  } catch (e) {
    console.error("Failed to load ConnectWallet:", e);
    return function NoConnect() {
      return (
        <button 
          onClick={() => window.location.reload()}
          style={{ 
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.875rem',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 87, 108, 0.4)'
          }}
        >
          Connect Wallet (Retry)
        </button>
      );
    };
  }
}, { 
  ssr: false,
  loading: () => (
    <button 
      style={{ 
        padding: '0.75rem 1.5rem',
        background: 'rgba(255, 255, 255, 0.2)',
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontWeight: 700,
        fontSize: '0.875rem',
        cursor: 'not-allowed',
        opacity: 0.7
      }}
      disabled
    >
      Loading...
    </button>
  )
});

function HeaderEnergy({ address }: { address?: string }) {
  const [energy, setEnergy] = React.useState<number | null>(null);
  const [maxEnergy, setMaxEnergy] = React.useState<number>(100);
  const [nextRefillIn, setNextRefillIn] = React.useState<number>(0);
  const [betTokens, setBetTokens] = React.useState<number | null>(null);

  const refreshEnergy = React.useCallback(async () => {
    if (!address) { 
      setEnergy(null);
      setBetTokens(null);
      return; 
    }
    try {
      const r = await fetch(`/api/energy?user=${address}`);
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        setEnergy(typeof j?.energy === 'number' ? j.energy : Number(j?.energy) || 0);
        setMaxEnergy(typeof j?.max_energy === 'number' ? j.max_energy : Number(j?.max_energy) || 100);
        setNextRefillIn(typeof j?.next_refill_in === 'number' ? j.next_refill_in : Number(j?.next_refill_in) || 0);
      }
    } catch (err) {
      console.error("Failed to fetch energy:", err);
    }
  }, [address]);

  const refreshBetTokens = React.useCallback(async () => {
    if (!address) { 
      setBetTokens(null);
      return; 
    }
    try {
      const r = await fetch(`/api/points?user=${address}`);
      const j = await r.json().catch(() => ({}));
      if (j?.ok) {
        const data = j.data || j;
        const tokens = typeof data?.bet_tokens === 'number' 
          ? data.bet_tokens 
          : (typeof data?.points === 'number' ? data.points : Number(data?.points) || 0);
        setBetTokens(tokens);
      }
    } catch (err) {
      console.error("Failed to fetch BET tokens:", err);
    }
  }, [address]);

  React.useEffect(() => {
    refreshEnergy();
    refreshBetTokens();
    // Refresh every second to update refill timer
    const interval = setInterval(() => {
      refreshEnergy();
      // Refresh BET tokens every 5 seconds (less frequent than energy)
      if (Math.floor(Date.now() / 1000) % 5 === 0) {
        refreshBetTokens();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshEnergy, refreshBetTokens]);

  React.useEffect(() => {
    const handleEnergyUpdate = (event: CustomEvent) => {
      if (event.detail?.address?.toLowerCase() === address?.toLowerCase()) {
        refreshEnergy();
      }
    };
    window.addEventListener('energy-updated', handleEnergyUpdate as EventListener);
    return () => {
      window.removeEventListener('energy-updated', handleEnergyUpdate as EventListener);
    };
  }, [address, refreshEnergy]);

  if (!address) return null;
  
  const formatTime = (seconds: number) => {
    if (seconds <= 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    // Only show seconds if less than 1 minute, otherwise just show minutes
    if (mins === 0) {
      return `${secs}s`;
    }
    return `${mins}m`;
  };

  const energyPercent = energy !== null ? (energy / maxEnergy) * 100 : 0;
  const isLowEnergy = energy !== null && energy < 30;
  const refillAmount = 10; // Energy refills 10 at a time

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(0.3rem, 0.6vw, 0.6rem)',
      flexWrap: 'nowrap',
      flexShrink: 0
    }}>
      {/* BET Tokens Display */}
      <div style={{
        padding: 'clamp(0.25rem, 0.4vw, 0.35rem) clamp(0.4rem, 0.8vw, 0.65rem)',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '2px solid rgba(255, 215, 0, 0.4)',
        borderRadius: '10px',
        color: '#fff',
        fontSize: 'clamp(0.55rem, 0.85vw, 0.7rem)',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(0.2rem, 0.4vw, 0.3rem)',
        boxShadow: '0 4px 20px rgba(255, 215, 0, 0.3)',
        transition: 'all 0.3s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}>
        <span style={{ 
          fontSize: 'clamp(0.65rem, 0.95vw, 0.8rem)',
          filter: 'drop-shadow(0 2px 8px rgba(255, 215, 0, 0.6))',
        }}>🪙</span>
        <span style={{ 
          fontWeight: 800, 
          fontSize: 'clamp(0.6rem, 0.85vw, 0.75rem)',
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
        }}>
          {betTokens !== null ? betTokens.toLocaleString() : '—'}
        </span>
        <span style={{ 
          fontSize: 'clamp(0.5rem, 0.75vw, 0.65rem)', 
          opacity: 0.8,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.8)'
        }}>
          BET
        </span>
      </div>

      {/* Energy Display */}
      <div style={{
        padding: 'clamp(0.25rem, 0.4vw, 0.35rem) clamp(0.4rem, 0.8vw, 0.65rem)',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: `2px solid ${isLowEnergy ? 'rgba(255, 107, 53, 0.4)' : 'rgba(120, 208, 66, 0.4)'}`,
        borderRadius: '10px',
        color: '#fff',
        fontSize: 'clamp(0.55rem, 0.85vw, 0.7rem)',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(0.25rem, 0.5vw, 0.4rem)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 4px 20px ${isLowEnergy ? 'rgba(255, 107, 53, 0.3)' : 'rgba(120, 208, 66, 0.3)'}`,
        transition: 'all 0.3s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0
      }}>
        {/* Animated background gradient */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${energyPercent}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${isLowEnergy ? 'rgba(255, 107, 53, 0.2)' : 'rgba(120, 208, 66, 0.2)'}, ${isLowEnergy ? 'rgba(255, 152, 0, 0.2)' : 'rgba(78, 222, 128, 0.2)'})`,
          transition: 'width 0.5s ease',
          zIndex: 0
        }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.15rem, 0.3vw, 0.25rem)', position: 'relative', zIndex: 1 }}>
          <span style={{ 
            fontSize: 'clamp(0.5rem, 0.75vw, 0.65rem)', 
            opacity: 0.9,
            fontWeight: 600,
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            +{refillAmount}
          </span>
          <span style={{ 
            fontSize: 'clamp(0.7rem, 1vw, 0.85rem)', 
            filter: `drop-shadow(0 2px 8px ${isLowEnergy ? 'rgba(255, 107, 53, 0.6)' : 'rgba(120, 208, 66, 0.6)'})`,
            animation: isLowEnergy ? 'pulse-glow 2s ease-in-out infinite' : 'none',
          }}>⚡</span>
          <span style={{ 
            fontWeight: 800, 
            fontSize: 'clamp(0.6rem, 0.85vw, 0.75rem)',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>
            {energy ?? 0}/{maxEnergy}
          </span>
          {nextRefillIn > 0 && energy !== null && energy < maxEnergy && formatTime(nextRefillIn) && (
            <span style={{ 
              fontSize: 'clamp(0.45rem, 0.7vw, 0.6rem)', 
              opacity: 0.8,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              (+{refillAmount} in {formatTime(nextRefillIn)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { address } = useAccount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [energy, setEnergy] = useState<number | null>(null);
  const [betTokens, setBetTokens] = useState<number | null>(null);

  // Determine active tab/page
  const isHomePage = pathname === '/';
  const _isPointsPage = pathname === '/points'; // Used in commented code
  const isGlobePage = pathname === '/globe';
  const isBaseDailyPage = pathname === '/base-daily';
  const isReferralsPage = pathname === '/referrals';
  const currentTab = isHomePage ? (searchParams.get('tab') || 'home') : null;
  const showFAQ = isHomePage && searchParams.get('tab') === 'faq';

  // Fetch energy and BET tokens
  useEffect(() => {
    if (!address) {
      setEnergy(null);
      setBetTokens(null);
      return;
    }
    async function fetchEnergy() {
      try {
        const r = await fetch(`/api/energy?user=${address}`);
        const j = await r.json().catch(() => ({}));
        if (j?.ok) {
          setEnergy(typeof j?.energy === 'number' ? j.energy : Number(j?.energy) || 0);
        }
      } catch (err) {
        console.error("Failed to fetch energy:", err);
      }
    }
    async function fetchBetTokens() {
      try {
        const r = await fetch(`/api/points?user=${address}`);
        const j = await r.json().catch(() => ({}));
        if (j?.ok) {
          const data = j.data || j;
          const tokens = typeof data?.bet_tokens === 'number' 
            ? data.bet_tokens 
            : (typeof data?.points === 'number' ? data.points : Number(data?.points) || 0);
          setBetTokens(tokens);
        }
      } catch (err) {
        console.error("Failed to fetch BET tokens:", err);
      }
    }
    fetchEnergy();
    fetchBetTokens();
    const handleEnergyUpdate = (event: CustomEvent) => {
      if (event.detail?.address?.toLowerCase() === address?.toLowerCase()) {
        fetchEnergy();
      }
    };
    window.addEventListener('energy-updated', handleEnergyUpdate as EventListener);
    return () => {
      window.removeEventListener('energy-updated', handleEnergyUpdate as EventListener);
    };
  }, [address]);

  // Navigation handlers
  const handleNavClick = (tab: string) => {
    setMobileMenuOpen(false);
    if (isHomePage) {
      if (tab === 'faq') {
        router.push('/?tab=faq');
      } else {
        router.push(`/?tab=${tab}`);
      }
    } else {
      router.push(`/?tab=${tab}`);
    }
  };

  const handleFAQClick = () => {
    setMobileMenuOpen(false);
    router.push('/?tab=faq');
  };

  const handleBaseDailyClick = () => {
    setMobileMenuOpen(false);
    router.push('/base-daily');
  };

  return (
    <>
      <style>{`
        /* Base.org & Candy Crush Inspired Navbar */
        .main-header {
          background: rgba(0, 0, 0, 0.3) !important;
          backdrop-filter: blur(30px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(30px) saturate(180%) !important;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset !important;
          position: relative !important;
        }

        .main-header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, #ff6b35, #f7931e, #fdb825, #78d042, #4a90e2, #ff6b35);
          background-size: 200% 100%;
          animation: gradient-shift 3s ease infinite;
        }
        
        .main-header .logo-text {
          background: linear-gradient(135deg, #ff6b35, #f7931e, #fdb825, #78d042) !important;
          background-size: 200% auto !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
          animation: shimmer 3s linear infinite !important;
          font-weight: 900 !important;
          letter-spacing: clamp(1px, 0.3vw, 3px) !important;
          text-transform: uppercase !important;
          filter: drop-shadow(0 4px 20px rgba(255, 107, 53, 0.5)) !important;
          font-size: clamp(1rem, 2vw, 1.4rem) !important;
        }

        /* Hide scrollbars but allow scrolling */
        .main-header > div::-webkit-scrollbar,
        .desktop-nav::-webkit-scrollbar {
          display: none !important;
        }
        
        .main-header > div,
        .desktop-nav {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
          scroll-padding-left: clamp(0.5rem, 1vw, 1rem) !important;
          scroll-padding-right: clamp(0.5rem, 1vw, 1rem) !important;
        }

        .desktop-nav button,
        .desktop-nav a {
          background: rgba(255, 255, 255, 0.05) !important;
          backdrop-filter: blur(10px) !important;
          border: 2px solid rgba(255, 255, 255, 0.15) !important;
          color: #FFD700 !important;
          border-radius: 14px !important;
          padding: clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 0.9rem) !important;
          font-weight: 700 !important;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: clamp(0.65rem, 1.1vw, 0.75rem) !important;
          position: relative !important;
          overflow: hidden !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
        }

        .desktop-nav button::before,
        .desktop-nav a::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 215, 0, 0.2);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }

        .desktop-nav button:hover::before,
        .desktop-nav a:hover::before {
          width: 200px;
          height: 200px;
        }

        .desktop-nav button:hover,
        .desktop-nav a:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          border-color: rgba(255, 215, 0, 0.5) !important;
          transform: translateY(-4px) scale(1.05) !important;
          box-shadow: 
            0 8px 24px rgba(255, 215, 0, 0.3),
            0 0 20px rgba(255, 215, 0, 0.2) !important;
          color: #fff !important;
        }

        .desktop-nav button.active,
        .desktop-nav a.active {
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 255, 255, 0.1)) !important;
          border-color: rgba(255, 215, 0, 0.6) !important;
          box-shadow: 
            0 0 30px rgba(255, 215, 0, 0.4),
            0 4px 20px rgba(255, 215, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
          color: #fff !important;
          animation: pulse-glow 2s ease-in-out infinite !important;
        }

        .wallet-connect-wrapper :global(button),
        .wallet-connect-wrapper :global([role="button"]) {
          background: linear-gradient(135deg, #78d042, #4a90e2) !important;
          background-size: 200% 200% !important;
          animation: gradient-shift 3s ease infinite !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          color: #FFFFFF !important;
          border-radius: 10px !important;
          padding: clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.65rem, 1.2vw, 0.95rem) !important;
          font-weight: 800 !important;
          transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          font-size: clamp(0.6rem, 0.85vw, 0.75rem) !important;
          box-shadow: 
            0 6px 20px rgba(120, 208, 66, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
        }

        .wallet-connect-wrapper :global(button:hover),
        .wallet-connect-wrapper :global([role="button"]:hover) {
          transform: translateY(-3px) scale(1.05) !important;
          box-shadow: 
            0 10px 30px rgba(120, 208, 66, 0.6),
            inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
        }

        .wallet-connect-wrapper :global(button:active),
        .wallet-connect-wrapper :global([role="button"]:active) {
          transform: translateY(-1px) scale(1.02) !important;
          animation: bounce-playful 0.4s ease-out !important;
        }

        /* Hide images/avatars in wallet connect component */
        .wallet-connect-wrapper :global(img),
        .wallet-connect-wrapper :global([class*="avatar"]),
        .wallet-connect-wrapper :global([class*="Avatar"]),
        .wallet-connect-wrapper :global(svg[class*="avatar"]),
        .wallet-section :global(img),
        .wallet-section :global([class*="avatar"]),
        .wallet-section :global([class*="Avatar"]) {
          display: none !important;
        }

        .mobile-menu {
          background: rgba(0, 0, 0, 0.95) !important;
          backdrop-filter: blur(30px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(30px) saturate(180%) !important;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
          animation: slide-up 0.3s ease-out !important;
        }

        .mobile-menu-item {
          color: #FFD700 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
          font-weight: 700 !important;
          text-transform: uppercase;
          letter-spacing: 1px;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          padding: 1rem 1.5rem !important;
          background: transparent !important;
        }

        .mobile-menu-item:hover {
          background: rgba(255, 215, 0, 0.1) !important;
          transform: translateX(8px) !important;
          border-left: 3px solid rgba(255, 215, 0, 0.6) !important;
        }

        .mobile-menu-item.active {
          background: rgba(255, 215, 0, 0.15) !important;
          border-left: 3px solid rgba(255, 215, 0, 0.8) !important;
          box-shadow: inset 0 0 20px rgba(255, 215, 0, 0.1) !important;
        }

        .mobile-menu-btn {
          background: rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(10px) !important;
          border: 2px solid rgba(255, 255, 255, 0.2) !important;
          color: #FFD700 !important;
          border-radius: 12px !important;
          padding: 0.6rem 1rem !important;
          font-weight: 800 !important;
          font-size: 1.2rem !important;
          transition: all 0.3s !important;
          cursor: pointer !important;
        }

        .mobile-menu-btn:hover {
          background: rgba(255, 255, 255, 0.15) !important;
          border-color: rgba(255, 215, 0, 0.5) !important;
          transform: scale(1.1) rotate(90deg) !important;
          box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3) !important;
        }

        @media (max-width: 1024px) {
          .desktop-nav {
            order: 3;
            width: 100%;
            margin-top: 0.5rem;
          }
          .wallet-section {
            order: 2;
          }
        }

        @media (max-width: 768px) {
          .main-header {
            padding: 1rem !important;
          }
          .desktop-nav {
            display: none !important;
          }
          .wallet-section {
            order: 2;
          }
        }

        @media (min-width: 769px) {
          .mobile-menu-btn {
            display: none !important;
          }
        }
      `}</style>
      <header
        className="main-header"
        style={{
          padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2.5vw, 2rem)",
          position: "sticky",
        top: 0,
        zIndex: 100,
        }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '1400px',
          margin: '0 auto',
          gap: 'clamp(0.5rem, 1vw, 1rem)',
          position: 'relative',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}>
          <Link 
            href="/" 
            className="logo" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              flexShrink: 0, 
              textDecoration: 'none', 
              color: 'inherit',
              transition: 'transform 0.3s ease',
              cursor: 'pointer',
              minWidth: 'fit-content'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <span className="logo-text">PROPHECY</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="desktop-nav" style={{ 
            display: 'flex', 
            gap: 'clamp(0.25rem, 0.5vw, 0.4rem)', 
            flexWrap: 'nowrap', 
            justifyContent: 'center', 
            flex: '1 1 auto',
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingLeft: 'clamp(0.25rem, 0.5vw, 0.5rem)',
            paddingRight: 'clamp(0.25rem, 0.5vw, 0.5rem)'
          }}>
            <button
              onClick={() => handleNavClick('home')}
              className={(isHomePage && (currentTab === 'home' || !currentTab)) ? 'active' : ''}
              style={{
                background: (isHomePage && (currentTab === 'home' || !currentTab)) ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                border: (isHomePage && (currentTab === 'home' || !currentTab)) ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
                color: (isHomePage && (currentTab === 'home' || !currentTab)) ? '#FFD700' : '#FFD700',
                padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: '8px', cursor: 'pointer', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >Home</button>
            <button
              onClick={() => handleNavClick('predictions')}
              className={(isHomePage && currentTab === 'predictions') ? 'active' : ''}
              style={{
                background: (isHomePage && currentTab === 'predictions') ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                border: (isHomePage && currentTab === 'predictions') ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
                color: (isHomePage && currentTab === 'predictions') ? '#FFD700' : '#FFD700',
                padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: '8px', cursor: 'pointer', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >Predictions</button>
            <button
              onClick={handleBaseDailyClick}
              className={isBaseDailyPage ? 'active' : ''}
              style={{
                background: isBaseDailyPage ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                border: isBaseDailyPage ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
                color: isBaseDailyPage ? '#FFD700' : '#FFD700',
                padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: '8px', cursor: 'pointer', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >Base Daily</button>
            <button
              onClick={() => handleNavClick('dashboard')}
              className={(isHomePage && currentTab === 'dashboard') ? 'active' : ''}
              style={{
                background: (isHomePage && currentTab === 'dashboard') ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                border: (isHomePage && currentTab === 'dashboard') ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
                color: (isHomePage && currentTab === 'dashboard') ? '#FFD700' : '#FFD700',
                padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: '8px', cursor: 'pointer', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >Portfolio</button>
            <Link href="/globe" onClick={() => setMobileMenuOpen(false)} style={{
              textDecoration: 'none', padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: 8,
              background: isGlobePage ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
              border: isGlobePage ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
              color: isGlobePage ? '#FFD700' : '#FFD700',
              textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
              transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
            }}>Forecast Engine</Link>
       { /*    <Link href="/points" onClick={() => setMobileMenuOpen(false)} style={{
              textDecoration: 'none', padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: 8,
              background: _isPointsPage ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
              border: _isPointsPage ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
              color: _isPointsPage ? '#FFD700' : '#FFD700',
              textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
              transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
            }}>BET Tokens</Link> */}
            <Link href="/referrals" onClick={() => setMobileMenuOpen(false)} style={{
              textDecoration: 'none', padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: 8,
              background: isReferralsPage ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
              border: isReferralsPage ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
              color: isReferralsPage ? '#FFD700' : '#FFD700',
              textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
              transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
            }}>Referrals</Link>
            <button
              onClick={handleFAQClick}
              className={showFAQ ? 'active' : ''}
              style={{
                background: showFAQ ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                border: showFAQ ? '1px solid rgba(255, 215, 0, 0.4)' : '1px solid transparent',
                color: showFAQ ? '#FFD700' : '#FFD700',
                padding: 'clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.6rem, 1.2vw, 1rem)', borderRadius: '8px', cursor: 'pointer', fontSize: 'clamp(0.65rem, 1.1vw, 0.875rem)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >FAQ</button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div 
              className="mobile-menu"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                padding: '1rem 0',
                zIndex: 1000
              }}
            >
              <button
                className={`mobile-menu-item ${(isHomePage && (currentTab === 'home' || !currentTab)) ? 'active' : ''}`}
                onClick={() => handleNavClick('home')}
              >Home</button>
              <button
                className={`mobile-menu-item ${(isHomePage && currentTab === 'predictions') ? 'active' : ''}`}
              onClick={() => handleNavClick('predictions')}
            >Predictions</button>
              <button
                className={`mobile-menu-item ${isBaseDailyPage ? 'active' : ''}`}
                onClick={handleBaseDailyClick}
              >Base Daily</button>
              <Link
                href="/globe"
                className={`mobile-menu-item ${isGlobePage ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer', fontFamily: 'inherit' }}
              >Forecast Engine</Link>
              <button
                className={`mobile-menu-item ${(isHomePage && currentTab === 'dashboard') ? 'active' : ''}`}
                onClick={() => handleNavClick('dashboard')}
              >Portfolio</button>
         {  /*   <Link
                href="/points"
                className={`mobile-menu-item ${_isPointsPage ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer', fontFamily: 'inherit' }}
              >BET Tokens</Link> */}
              <Link
                href="/referrals"
                className={`mobile-menu-item ${isReferralsPage ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer', fontFamily: 'inherit' }}
              >Referrals</Link>
              <button
                className={`mobile-menu-item ${showFAQ ? 'active' : ''}`}
                onClick={handleFAQClick}
              >FAQ</button>
              
              {/* BET Tokens and Energy Section in Mobile Menu */}
              {address && (
                <div 
                  className="mobile-menu-wallet" 
                  style={{ 
                    padding: '0.75rem 1rem',
                    borderTop: '2px solid rgba(255, 255, 255, 0.1)',
                    marginTop: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(255, 255, 255, 0.1)', 
                    border: '1px solid rgba(255, 215, 0, 0.3)', 
                    borderRadius: '8px', 
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '44px'
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>🪙 BET Tokens:</span>
                    <strong style={{ color: '#FFD700', fontSize: '1rem' }}>{betTokens !== null ? betTokens.toLocaleString() : '—'}</strong>
                  </div>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'rgba(255, 255, 255, 0.1)', 
                    border: '1px solid rgba(255, 255, 255, 0.2)', 
                    borderRadius: '8px', 
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '44px'
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>⚡ Energy:</span>
                    <strong style={{ color: '#fff', fontSize: '1rem' }}>{energy ?? 0}/100</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="wallet-section" style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            alignItems: 'center', 
            gap: 'clamp(0.3rem, 0.6vw, 0.6rem)', 
            flexShrink: 0,
            minWidth: 'fit-content',
            flexWrap: 'nowrap'
          }}>
            {address && (
              <div style={{ flexShrink: 0 }}>
                <HeaderEnergy address={address || undefined} />
              </div>
            )}
            <div className="wallet-connect-wrapper" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              maxWidth: 'fit-content',
              flexShrink: 0
            }}>
              <DynamicConnectWallet />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
