"use client";
import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, useSignTypedData, useReadContract, useDisconnect } from "wagmi";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { TrendingUp, Flame, Zap, Award } from 'lucide-react';
import Image from 'next/image';
import KalshiPredictions from './components/KalshiPredictions';
import FAQ from './components/FAQ';
import PredictionsDashboard from './components/PredictionsDashboard';
import ShareToFarcaster from './components/ShareToFarcaster';
import { computeTier } from '@/lib/tier';

// Prevent static generation - this page uses client-side hooks
export const dynamic = 'force-dynamic';

// Your ERC721 ABI and tier requirements
const ERC721_MINT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' }
    ],
    name: 'mintWithSig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'burnTokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'newTokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' }
    ],
    name: 'upgradeWithSig',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://prophecy.house").replace(/\/$/, "");


interface StatsData {
  stats: {
    tx_count: number;
    nft_count: number;
    erc20_count: number;
    unique_peers: number;
    nft_collections: number;
    erc20_usd: number;
    has_basename: boolean;
    basename?: string;
  };
  tier: number;
  animal: string;
  minted_tier?: number | null;
  minted_animal?: string | null;
  minted_token_id?: number | null;
  scores?: {
    token_swaps?: number;
    current_streak_days?: number;
    longest_streak_days?: number;
    onchain_score?: number;
  };
}

function HomeContent() {
  const searchParams = useSearchParams();
  const { address: wagmiAddress, isConnected } = useAccount();
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [_error, setError] = useState<string | null>(null); // Error state for future error display
  const [data, setData] = useState<StatsData | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'predictions' | 'dashboard' | 'faq'>("home");
  const [showFAQ, setShowFAQ] = useState<boolean>(false);
  const [minting, setMinting] = useState<boolean>(false);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [mintedTier, setMintedTier] = useState<number | null>(null);
  const [mintedAnimal, setMintedAnimal] = useState<string | null>(null);
  const [mintMetadataUrl, setMintMetadataUrl] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string>("");
  const [referralSubmitted, setReferralSubmitted] = useState<boolean>(false);
  const [referralProcessing, setReferralProcessing] = useState<boolean>(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  
  useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending: isMintPending } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  
  const contractAddress = (process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || "");

  // Check if user has an NFT
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ERC721_MINT_ABI,
    functionName: "balanceOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!contractAddress && contractAddress.length === 42,
    },
  });

  const hasBalance: boolean = typeof balance === 'bigint' ? Number(balance) > 0 : false;

  // Check if user already has a referral code
  useEffect(() => {
    if (address) {
      const storedRef = localStorage.getItem("referral_code");
      if (storedRef && storedRef.trim().length > 0) {
        setReferralSubmitted(true);
      }
    }
  }, [address]);

  // Handle referral code from URL (optional - if no referral, app works normally)
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode && address) {
      const trimmedCode = refCode.trim();
      // Store referral code in localStorage (can be PROPH-XXXXX or wallet address for backward compatibility)
      localStorage.setItem("referral_code", trimmedCode);
      setReferralCode(trimmedCode);
      // Optionally create referral immediately if user is connected
      // If this fails, that's fine - user can still use the app normally
      const isReferralCode = /^PROPH-[A-Z0-9]{8}$/i.test(trimmedCode);
      const isWalletAddress = /^0x[a-f0-9]{40}$/i.test(trimmedCode);
      
      if ((isReferralCode || isWalletAddress) && address.toLowerCase() !== trimmedCode.toLowerCase()) {
        fetch("/api/referrals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            referralCode: isReferralCode ? trimmedCode.toUpperCase() : null,
            referrer: isWalletAddress ? trimmedCode.toLowerCase() : null, // Fallback for backward compatibility
            referred: address.toLowerCase(),
          }),
        }).catch((err) => {
          // Non-fatal: referral creation failed, but app continues normally
          console.warn("Referral creation failed (non-fatal, app continues normally):", err);
        });
      }
    }
  }, [searchParams, address]);

  const handleReferralSubmit = async () => {
    if (!address) return;
    
    const trimmedCode = referralCode.trim();
    if (!trimmedCode) {
      setReferralError("Please enter a referral code");
      return;
    }

    // Validate: either a referral code (PROPH-XXXXX) or wallet address (for backward compatibility)
    const isReferralCode = /^PROPH-[A-Z0-9]{8}$/i.test(trimmedCode);
    const isWalletAddress = /^0x[a-f0-9]{40}$/i.test(trimmedCode);
    
    if (!isReferralCode && !isWalletAddress) {
      setReferralError("Please enter a valid referral code (PROPH-XXXXX) or wallet address");
      return;
    }

    // Self-referral check (only for wallet addresses, codes are validated server-side)
    if (isWalletAddress && trimmedCode.toLowerCase() === address.toLowerCase()) {
      setReferralError("You cannot refer yourself");
      return;
    }

    setReferralProcessing(true);
    setReferralError(null);

    try {
      // Store referral code in localStorage
      localStorage.setItem("referral_code", isReferralCode ? trimmedCode.toUpperCase() : trimmedCode.toLowerCase());
      
      // Create referral using code system (or fallback to wallet address)
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          referralCode: isReferralCode ? trimmedCode.toUpperCase() : null,
          referrer: isWalletAddress ? trimmedCode.toLowerCase() : null, // Fallback for backward compatibility
          referred: address.toLowerCase(),
        }),
      });

      const json = await res.json();
      if (json.ok) {
        setReferralSubmitted(true);
        setReferralCode("");
      } else {
        setReferralError(json.message || json.error || "Failed to submit referral code");
      }
    } catch {
      setReferralError("Failed to submit referral code. Please try again.");
    } finally {
      setReferralProcessing(false);
    }
  };

  useEffect(() => {
    if (wagmiAddress && isConnected) {
      setAddress(wagmiAddress.toLowerCase());
    } else {
      setAddress(null);
    }
  }, [wagmiAddress, isConnected]);

  // Allow external navigation via /?tab=predictions|home|faq
  useEffect(() => {
    const t = (searchParams.get("tab") || "").toLowerCase();
    if (t === "predictions") { setShowFAQ(false); setActiveTab('predictions'); }
    else if (t === "home") { setShowFAQ(false); setActiveTab('home'); }
    else if (t === "dashboard") { setShowFAQ(false); setActiveTab('dashboard'); }
    else if (t === "faq") { setShowFAQ(true); setActiveTab('home'); }
  }, [searchParams]);

  const fetchStats = useCallback(async (forceRefresh = false) => {
    if (!address) return;
    setLoading(true);
    setError(null);
    
    const refreshParam = forceRefresh ? "&refresh=1" : "";
    fetch(`/api/stats?address=${address}${refreshParam}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      })
      .then((json) => {
        console.log("[page.tsx] Stats API response:", json);
        setData(json);
        if (json.minted_tier !== null && json.minted_tier !== undefined) {
          setMintedTier(json.minted_tier);
        }
        if (json.minted_animal) {
          setMintedAnimal(json.minted_animal);
        }
        if (json.minted_token_id !== null && json.minted_token_id !== undefined) {
          setMintedTokenId(json.minted_token_id);
        }
        if (json.minted_metadata_url) {
          setMintMetadataUrl(json.minted_metadata_url);
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [address]);

  useEffect(() => {
    if (!address) return;
    fetchStats(false);
  }, [address, fetchStats]);

  const handleMint = async () => {
    if (!address || !data?.stats) {
      setError("Please connect wallet and fetch stats first");
      return;
    }

    setMinting(true);
    setMintStatus("Checking network...");
    setError(null);

    const isUpgrade = hasBalance && mintedTokenId !== null;
    const burnTokenId = isUpgrade ? mintedTokenId : null;

    try {
      const expectedChainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532", 10);
      
      if (chainId !== expectedChainId) {
        setError(`Wrong network! Please switch to Base ${expectedChainId === 84532 ? "Sepolia" : "Mainnet"}`);
        setMintStatus("Switch network required");
        setMinting(false);

        if (switchChain && (expectedChainId === 84532 || expectedChainId === 8453)) {
          try {
            await switchChain({ chainId: expectedChainId });
            setMintStatus("Switched to Base network. Please try minting again.");
            return;
          } catch (switchError) {
            console.error("Failed to switch chain:", switchError);
            setError(`Failed to switch network. Please manually switch to Base.`);
            return;
          }
        }
        return;
      }

      setMintStatus("Uploading to IPFS...");
      const uploadResponse = await fetch("/api/upload-ipfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          stats: data.stats,
        }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || "Failed to upload to IPFS");
      }

      const uploadData = await uploadResponse.json();
      if (uploadData.tier !== undefined) setMintedTier(uploadData.tier);
      if (uploadData.animal) setMintedAnimal(uploadData.animal);
      if (uploadData.metadataUrl) setMintMetadataUrl(uploadData.metadataUrl);

      setMintStatus(isUpgrade ? "Getting upgrade signature..." : "Getting signature...");
      const signResponse = await fetch("/api/sign-mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          tokenId: 0,
          burnTokenId: burnTokenId ? burnTokenId.toString() : undefined,
        }),
      });

      if (!signResponse.ok) {
        const errorData = await signResponse.json();
        throw new Error(errorData.message || "Failed to get signature");
      }

      const signData = await signResponse.json();
      if (!signData.ok) {
        throw new Error(signData.error || "Failed to get signature");
      }

      setMintStatus("Please sign the message in your wallet...");
      const isUpgradeFlow = signData.action === "upgrade";
      const messageForSigning = isUpgradeFlow
        ? {
            to: signData.message.to,
            burnTokenId: BigInt(signData.message.burnTokenId),
            newTokenId: BigInt(signData.message.newTokenId),
            nonce: BigInt(signData.message.nonce),
            deadline: BigInt(signData.message.deadline),
          }
        : {
            to: signData.message.to,
            tokenId: BigInt(signData.message.tokenId),
            nonce: BigInt(signData.message.nonce),
            deadline: BigInt(signData.message.deadline),
          };

      const signature = await signTypedDataAsync({
        domain: signData.domain,
        types: signData.types,
        primaryType: signData.primaryType || (isUpgradeFlow ? "Upgrade" : "Mint"),
        message: messageForSigning,
      });

      setMintStatus(isUpgradeFlow ? "Upgrading NFT..." : "Minting NFT...");
      const toAddress = signData.to as `0x${string}`;

      if (isUpgradeFlow) {
        writeContract({
          address: contractAddress as `0x${string}`,
          abi: ERC721_MINT_ABI,
          functionName: "upgradeWithSig",
          args: [
            toAddress,
            BigInt(signData.burnTokenId),
            BigInt(signData.newTokenId),
            BigInt(signData.nonce),
            BigInt(signData.deadline),
            signature,
          ],
        });
      } else {
        writeContract({
          address: contractAddress as `0x${string}`,
          abi: ERC721_MINT_ABI,
          functionName: "mintWithSig",
          args: [
            toAddress,
            BigInt(signData.tokenId),
            BigInt(signData.nonce),
            BigInt(signData.deadline),
            signature,
          ],
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Mint failed: ${message}`);
      setMintStatus(null);
      setMinting(false);
    }
  };

  useEffect(() => {
    if (!isConfirmed || !receipt || !contractAddress || !address) return;
    
    const currentAddress = address;
    try {
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const zeroAddress = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const userAddressPadded = currentAddress.toLowerCase().slice(2).padStart(64, '0');
      const userAddressTopic = `0x${userAddressPadded}`;
      
      const allTransferEvents = receipt.logs?.filter((log) => {
        if (log.address.toLowerCase() !== contractAddress.toLowerCase()) return false;
        return log.topics?.[0]?.toLowerCase() === transferTopic.toLowerCase() &&
               log.topics?.[2]?.toLowerCase() === userAddressTopic.toLowerCase();
      });

      const mintTransferEvent = allTransferEvents?.find((log) => 
        log.topics?.[1]?.toLowerCase() === zeroAddress.toLowerCase()
      );

      if (mintTransferEvent && mintTransferEvent.topics?.[3]) {
        const tokenId = parseInt(mintTransferEvent.topics[3], 16);
        setMintedTokenId(tokenId);
        
        setTimeout(() => {
          if (mintMetadataUrl && mintedTier !== null && mintedAnimal) {
            fetch("/api/record-mint", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: currentAddress,
                tokenId,
                tier: mintedTier,
                animal: mintedAnimal,
                metadataUrl: mintMetadataUrl,
              }),
            }).catch(err => console.error("Failed to record mint:", err));
          }
        }, 100);
      }
    } catch (err) {
      console.error("Failed to extract token ID from receipt:", err);
    }

    setTimeout(() => {
      if (refetchBalance) refetchBalance().catch(console.error);
    }, 1000);

    setMintStatus("NFT minted successfully!");
    setMinting(false);
    setTimeout(() => setMintStatus(null), 5000);
  }, [isConfirmed, receipt, contractAddress, address, refetchBalance, mintMetadataUrl, mintedTier, mintedAnimal]);

  // Scan for token ID if balance exists but no token tracked
  useEffect(() => {
    if (hasBalance && !mintedTokenId && address && contractAddress && contractAddress.length === 42) {
      const findTokenId = async () => {
        try {
          const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532", 10);
          const chain = chainId === 8453 ? base : baseSepolia;
          const publicClient = createPublicClient({
            chain,
            transport: http(),
          });

          for (let tokenId = 1; tokenId <= 1000; tokenId++) {
            try {
              const owner = await publicClient.readContract({
                address: contractAddress as `0x${string}`,
                abi: ERC721_MINT_ABI,
                functionName: 'ownerOf',
                args: [BigInt(tokenId)],
              });
              
              if (typeof owner === 'string' && owner.toLowerCase() === address.toLowerCase()) {
                setMintedTokenId(tokenId);
                return;
              }
            } catch {
              continue;
            }
          }
        } catch (err) {
          console.error("Error finding token ID:", err);
        }
      };

      findTokenId();
    }
  }, [hasBalance, balance, mintedTokenId, address, contractAddress]);
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

      <main
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "clamp(1rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem)",
          position: 'relative',
          zIndex: 1
        }}
      >
                <style>{`
                    .nft-card {
            background: rgba(255, 255, 255, 0.05) !important;
            backdrop-filter: blur(30px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(30px) saturate(180%) !important;
            border: 2px solid rgba(255, 255, 255, 0.2) !important;
            border-radius: 32px !important;
            box-shadow: 
              0 20px 60px rgba(0, 0, 0, 0.3),
              0 0 0 1px rgba(255, 255, 255, 0.1) inset,
              0 0 80px rgba(255, 107, 53, 0.1) !important;
            transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            animation: scale-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
          }

          .nft-card:hover {
            transform: translateY(-8px) scale(1.02) !important;
            box-shadow: 
              0 30px 80px rgba(0, 0, 0, 0.4),
              0 0 0 1px rgba(255, 255, 255, 0.2) inset,
              0 0 120px rgba(255, 107, 53, 0.2) !important;
            border-color: rgba(255, 255, 255, 0.4) !important;
          }

                    .nft-image {
            background: linear-gradient(135deg, rgba(255, 107, 53, 0.2), rgba(120, 208, 66, 0.2), rgba(99, 102, 241, 0.2)) !important;
            background-size: 200% 200% !important;
            animation: gradient-shift 8s ease infinite !important;
            border: 3px solid rgba(255, 255, 255, 0.3) !important;
            border-radius: 24px !important;
            box-shadow: 
              0 20px 60px rgba(255, 107, 53, 0.3),
              0 0 40px rgba(120, 208, 66, 0.2),
              inset 0 0 40px rgba(255, 255, 255, 0.1) !important;
            position: relative !important;
            overflow: hidden !important;
          }

          .nft-image::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
            animation: float 8s ease-in-out infinite;
          }

          .stat-card {
            background: rgba(255, 255, 255, 0.05) !important;
            backdrop-filter: blur(20px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
            border: 2px solid rgba(255, 255, 255, 0.15) !important;
            border-radius: 24px !important;
            box-shadow: 
              0 10px 40px rgba(0, 0, 0, 0.2),
              0 0 0 1px rgba(255, 255, 255, 0.05) inset !important;
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
            position: relative !important;
            overflow: hidden !important;
            animation: slide-up 0.6s ease-out forwards !important;
            opacity: 1 !important;
          }

          .stat-card:nth-child(1) { animation-delay: 0.1s !important; }
          .stat-card:nth-child(2) { animation-delay: 0.2s !important; }
          .stat-card:nth-child(3) { animation-delay: 0.3s !important; }
          .stat-card:nth-child(4) { animation-delay: 0.4s !important; }

          .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
            transition: left 0.5s;
          }

          .stat-card:hover::before {
            left: 100%;
          }

          .stat-card:hover {
            transform: translateY(-12px) scale(1.05) rotate(1deg) !important;
            box-shadow: 
              0 20px 60px rgba(0, 0, 0, 0.3),
              0 0 0 1px rgba(255, 255, 255, 0.2) inset,
              0 0 60px rgba(255, 107, 53, 0.3) !important;
            border-color: rgba(255, 255, 255, 0.4) !important;
          }

          .vibrant-button {
            background: linear-gradient(135deg, #ff6b35, #f7931e, #fdb825) !important;
            background-size: 200% 200% !important;
            animation: gradient-shift 3s ease infinite !important;
            border: 2px solid rgba(255, 255, 255, 0.3) !important;
            border-radius: 16px !important;
            color: white !important;
            font-weight: 800 !important;
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            box-shadow: 
              0 10px 30px rgba(255, 107, 53, 0.4),
              0 0 20px rgba(255, 215, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
            position: relative !important;
            overflow: hidden !important;
          }

          .vibrant-button::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
          }

          .vibrant-button:hover::before {
            width: 300px;
            height: 300px;
          }

          .vibrant-button:hover {
            transform: translateY(-4px) scale(1.05) !important;
            box-shadow: 
              0 15px 40px rgba(255, 107, 53, 0.6),
              0 0 30px rgba(255, 215, 0, 0.4),
              inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
          }

          .vibrant-button:active {
            transform: translateY(-2px) scale(1.02) !important;
            animation: bounce-playful 0.4s ease-out !important;
          }

          .vibrant-button:disabled {
            opacity: 0.5 !important;
            cursor: not-allowed !important;
            animation: none !important;
          }

          .shimmer-title {
            background: linear-gradient(90deg, #ff6b35, #f7931e, #fdb825, #78d042, #4a90e2, #ff6b35) !important;
            background-size: 200% auto !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            background-clip: text !important;
            animation: shimmer 3s linear infinite !important;
            font-weight: 900 !important;
            filter: drop-shadow(0 4px 20px rgba(255, 107, 53, 0.5)) !important;
          }

          @media (max-width: 768px) {
            .nft-card {
              border-radius: 24px !important;
              padding: 1.5rem !important;
            }
            .stat-card {
              border-radius: 20px !important;
              padding: 1.5rem !important;
            }
            .nft-layout {
              grid-template-columns: 1fr !important;
              gap: 1.5rem !important;
            }
            .nft-image {
              width: 180px !important;
              height: 180px !important;
              margin: 0 auto !important;
              font-size: 4rem !important;
            }
            .nft-content {
              text-align: center !important;
            }
            .shimmer-title {
              font-size: 1.75rem !important;
              line-height: 1.3 !important;
            }
            .nft-buttons {
              flex-direction: column !important;
            }
            .nft-buttons button {
              width: 100% !important;
              padding: 0.875rem 1.5rem !important;
              font-size: 0.9rem !important;
            }
            .stats-grid {
              grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)) !important;
              gap: 1rem !important;
            }
            .stat-card .stat-value {
              font-size: 2rem !important;
            }
            .stat-card .stat-label {
              font-size: 0.8rem !important;
            }
            .stat-icon {
              width: 28px !important;
              height: 28px !important;
            }
          }
          
          @media (max-width: 480px) {
            .nft-card {
              padding: 1.25rem !important;
              border-radius: 20px !important;
            }
            .nft-image {
              width: 150px !important;
              height: 150px !important;
              font-size: 3.5rem !important;
            }
            .shimmer-title {
              font-size: 1.5rem !important;
            }
            .stats-grid {
              grid-template-columns: 1fr 1fr !important;
              gap: 0.75rem !important;
            }
            .stat-card {
              padding: 1.25rem !important;
            }
            .stat-card .stat-value {
              font-size: 1.75rem !important;
            }
            .stat-icon {
              width: 24px !important;
              height: 24px !important;
            }
          }
                `}</style>

        {showFAQ ? (
          <FAQ />
        ) : (
          <>
            {/* Predictions content - show FIRST when predictions tab is active */}
            {activeTab === 'predictions' && (
              <div style={{ marginBottom: 'clamp(1.5rem, 4vw, 3rem)' }}>
                <KalshiPredictions address={address || undefined} />
              </div>
            )}
            
            {/* Home content - show when home tab is active, or below predictions when predictions tab is active */}
            {activeTab === 'home' || activeTab === 'predictions' ? (
              <>
                {data && (
                  <>
                    <div className="nft-card" style={{
                      padding: 'clamp(1.25rem, 4vw, 3rem)',
                      marginBottom: 'clamp(1.5rem, 4vw, 3rem)'
                    }}>
                  <div className="nft-layout" style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: 'clamp(1.5rem, 4vw, 3rem)',
                    alignItems: 'center'
                  }}>
                    <div className="nft-image" style={{
                      width: 'clamp(150px, 20vw, 240px)',
                      height: 'clamp(150px, 20vw, 240px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'clamp(3.5rem, 8vw, 5rem)',
                      flexShrink: 0,
                      position: 'relative',
                      zIndex: 1,
                      margin: '0 auto'
                    }}>
                      {mintedTokenId !== null ? (
                        <Image
                          src={`/api/image/${mintedTokenId}.png`}
                          alt="NFT"
                          width={300}
                          height={300}
                          unoptimized
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '20px',
                            position: 'relative',
                            zIndex: 2
                          }}
                        />
                      ) : (
                        <div style={{ 
                          position: 'relative', 
                          zIndex: 2,
                          animation: 'float 4s ease-in-out infinite',
                          filter: 'drop-shadow(0 10px 30px rgba(255, 107, 53, 0.5))'
                        }}>
                          {data?.animal === 'Tiger' && '🐯'}
                          {data?.animal === 'Phoenix' && '🔥'}
                          {data?.animal === 'Dragon' && '🐉'}
                          {data?.animal === 'Wolf' && '🐺'}
                          {data?.animal === 'Serpent' && '🐍'}
                          {data?.animal && !['Tiger', 'Phoenix', 'Dragon', 'Wolf', 'Serpent'].includes(data.animal) && '🏆'}
                        </div>
                      )}
                    </div>

                    <div className="nft-content" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 3vw, 1.5rem)', position: 'relative', zIndex: 1 }}>
                      <div>
                        <h2 className="shimmer-title" style={{ 
                          margin: '0 0 clamp(0.5rem, 2vw, 0.75rem) 0', 
                          fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
                          lineHeight: '1.2'
                        }}>
                          Tier {mintedTier ?? data?.tier ?? 0} {mintedAnimal ?? data?.animal ?? ''}
                        </h2>
                        <p style={{ 
                          margin: 0, 
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
                          fontWeight: 500
                        }}>
                          {hasBalance ? '✨ Your on-chain identity badge' : '🎯 Eligible for minting'}
                        </p>
                      </div>

                      <div className="nft-buttons" style={{ display: 'flex', gap: 'clamp(0.75rem, 2vw, 1rem)', flexWrap: 'wrap' }}>
                        {(() => {
                          const currentTier = mintedTier ?? data?.tier ?? 0;
                          const newTier = data?.stats ? computeTier({
                            tx_count: data.stats.tx_count,
                            unique_peers: data.stats.unique_peers ?? 0,
                            erc20_count: data.stats.erc20_count ?? 0,
                            erc20_usd: data.stats.erc20_usd ?? 0,
                            nft_collections: data.stats.nft_collections ?? 0,
                            nft_count: data.stats.nft_count,
                            has_basename: data.stats.has_basename ?? false,
                            basename: data.stats.basename
                          }) : 0;
                          const canUpgrade = hasBalance && newTier > currentTier;
                          const canMint = !hasBalance && newTier >= 1;
                          const isDisabled = minting || isMintPending || isConfirming || (hasBalance && !canUpgrade);
                          
                          return (
                            <button
                              onClick={handleMint}
                              disabled={isDisabled}
                              className="vibrant-button"
                              style={{
                                padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1.5rem, 4vw, 2rem)',
                                fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                position: 'relative',
                                zIndex: 1,
                                width: '100%',
                                minWidth: 'fit-content'
                              }}
                              title={hasBalance && !canUpgrade 
                                ? `You need to qualify for a higher tier (Tier ${currentTier + 1}+) to upgrade. Current: Tier ${currentTier}, Qualify for: Tier ${newTier}`
                                : undefined}
                            >
                              <span style={{ position: 'relative', zIndex: 2 }}>
                              {minting || isMintPending || isConfirming
                                  ? (mintStatus || "⏳ Processing...")
                                : hasBalance
                                  ? canUpgrade
                                    ? `⬆️ Upgrade to Tier ${newTier}`
                                    : `⬆️ Upgrade NFT (Tier ${newTier}, need ${currentTier + 1}+)`
                                  : canMint
                                    ? "✨ Mint NFT"
                                    : "✨ Mint NFT (Requirements not met)"}
                              </span>
                            </button>
                          );
                        })()}

                        <button
                          onClick={() => fetchStats(true)}
                          disabled={loading}
                          className="bounce-btn"
                          style={{
                            padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1.5rem, 4vw, 2rem)',
                            background: 'rgba(255, 255, 255, 0.1)',
                            backdropFilter: 'blur(10px)',
                            border: '2px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '16px',
                            color: '#fff',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                            opacity: loading ? 0.6 : 1,
                            transition: 'all 0.3s',
                            position: 'relative',
                            zIndex: 1,
                            width: '100%',
                            minWidth: 'fit-content'
                          }}
                        >
                          {loading ? '⟳' : '🔄'} Refresh
                        </button>
                        {mintedTokenId !== null && (() => {
                          const shareTierValue = mintedTier ?? data?.tier ?? null;
                          const shareAnimalValue = mintedAnimal ?? data?.animal ?? null;
                          const tierLabel = shareTierValue ? `Tier ${shareTierValue}` : "Tier";
                          const animalLabel = shareAnimalValue ?? "Neural Shard";
                          const shareText = `Minted my ${tierLabel} ${animalLabel} on Base. ⚡️`;
                          // Include the actual NFT image via art parameter, use small JPEG for optimal sharing
                          const nftImageUrl = `${SITE_URL}/api/image/${mintedTokenId}.png`;
                          // Use large size for richer preview; include cache-buster `v` to avoid stale images
                          const imageUrl = `${SITE_URL}/api/frames/nft.png?token=${mintedTokenId}&tier=${encodeURIComponent(tierLabel)}&animal=${encodeURIComponent(animalLabel)}&size=large&fmt=jpeg&art=${encodeURIComponent(nftImageUrl)}&v=2`;
                          return (
                            <ShareToFarcaster
                              kind="nft"
                              wallet={address || undefined}
                              tokenId={mintedTokenId}
                              text={shareText}
                              imageUrl={imageUrl}
                              pageUrl={`${SITE_URL}/nft/${mintedTokenId}`}
                            />
                          );
                        })()}
                      </div>

                      {mintStatus && (
                        <div style={{
                          fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                          color: 'rgba(255, 255, 255, 0.9)',
                          padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
                          background: 'rgba(120, 208, 66, 0.2)',
                          backdropFilter: 'blur(10px)',
                          border: '2px solid rgba(120, 208, 66, 0.4)',
                          borderRadius: '12px',
                          animation: 'slide-up 0.4s ease-out',
                          textAlign: 'center'
                        }}>
                          ✨ {mintStatus}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="stats-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
                  gap: 'clamp(0.75rem, 3vw, 1.5rem)',
                  marginTop: 'clamp(1.5rem, 4vw, 2rem)',
                  width: '100%',
                  visibility: 'visible',
                  opacity: 1
                }}>
                  {[
                    { icon: Zap, label: 'Transactions', value: data?.stats?.tx_count ?? 0, color: '#f5576c', emoji: '⚡' },
                    { icon: Award, label: 'NFTs Owned', value: data?.stats?.nft_count ?? 0, color: '#f093fb', emoji: '🏆' },
                    { icon: TrendingUp, label: 'Token Swaps', value: data?.scores?.token_swaps ?? '—', color: '#a78bfa', emoji: '📈' },
                    { icon: Flame, label: 'Daily Streak', value: `${data?.scores?.current_streak_days ?? 0} days`, color: '#fb923c', emoji: '🔥' }
                  ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <div key={i} className="stat-card interactive-card" style={{
                        padding: 'clamp(1.25rem, 3vw, 2rem)',
                        cursor: 'pointer',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute',
                          top: 'clamp(0.75rem, 2vw, 1rem)',
                          right: 'clamp(0.75rem, 2vw, 1rem)',
                          fontSize: 'clamp(1.5rem, 4vw, 2rem)',
                          opacity: 0.3,
                          animation: 'float 3s ease-in-out infinite',
                          animationDelay: `${i * 0.2}s`
                        }}>
                          {stat.emoji}
                        </div>
                        <Icon className="stat-icon" size={36} color={stat.color} style={{ 
                          marginBottom: 'clamp(0.75rem, 2vw, 1rem)',
                          filter: `drop-shadow(0 4px 12px ${stat.color}80)`,
                          animation: 'pulse-glow 2s ease-in-out infinite',
                          animationDelay: `${i * 0.3}s`,
                          width: 'clamp(24px, 6vw, 36px)',
                          height: 'clamp(24px, 6vw, 36px)'
                        }} />
                        <div className="stat-value" style={{ 
                          fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', 
                          fontWeight: 900, 
                          marginBottom: 'clamp(0.25rem, 1vw, 0.5rem)', 
                          color: '#fff',
                          textShadow: `0 4px 20px ${stat.color}60`,
                          background: `linear-gradient(135deg, ${stat.color}, ${stat.color}dd)`,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}>
                          {stat.value}
                        </div>
                        <div className="stat-label" style={{ 
                          fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', 
                          color: 'rgba(255, 255, 255, 0.8)', 
                          textTransform: 'uppercase', 
                          letterSpacing: '1px',
                          fontWeight: 600
                        }}>
                          {stat.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {/* Referral Code Input Section - Show when connected but no referral submitted */}
            {address && !referralSubmitted && (
              <div className="glass-card-dark" style={{ 
                padding: 'clamp(1.5rem, 4vw, 2.5rem)', 
                borderRadius: 'clamp(24px, 6vw, 32px)',
                border: '2px solid rgba(255, 215, 0, 0.3)',
                animation: 'scale-in 0.6s ease-out',
                marginTop: 'clamp(1.5rem, 4vw, 3rem)',
                marginBottom: 'clamp(1.5rem, 4vw, 3rem)',
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 107, 53, 0.1))',
                boxShadow: '0 20px 60px rgba(255, 215, 0, 0.2)'
              }}>
                <div style={{ textAlign: 'center', marginBottom: 'clamp(1rem, 3vw, 1.5rem)' }}>
                  <div style={{ fontSize: 'clamp(2.5rem, 8vw, 3rem)', marginBottom: 'clamp(0.25rem, 1vw, 0.5rem)', animation: 'float 3s ease-in-out infinite' }}>🎁</div>
                  <h3 className="shimmer-text" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', marginBottom: 'clamp(0.25rem, 1vw, 0.5rem)', fontWeight: 800, color: '#FFD700' }}>
                    Enter Referral Code
                  </h3>
                  <p style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)', marginBottom: 'clamp(0.125rem, 0.5vw, 0.25rem)', fontWeight: 600 }}>
                    Get <span style={{ color: '#FFD700', fontWeight: 800 }}>50 BET Tokens</span> when you use a referral code!
                  </p>
                  <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>
                    Paste your friend&apos;s referral link or code (PROPH-XXXXX)
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 'clamp(0.75rem, 2vw, 1rem)', flexDirection: 'column' }}>
                  <input
                    type="text"
                    placeholder="PROPH-XXXXX or paste referral link"
                    value={referralCode}
                    onChange={(e) => {
                      let value = e.target.value.trim();
                      // Extract referral code from URL if full referral link is pasted
                      if (value.includes('?ref=')) {
                        const match = value.match(/[?&]ref=([^&]+)/i);
                        if (match) {
                          value = decodeURIComponent(match[1]);
                        }
                      }
                      // Normalize: convert to uppercase if it looks like a referral code
                      if (/^PROPH-[A-Z0-9]{8}$/i.test(value)) {
                        value = value.toUpperCase();
                      }
                      setReferralCode(value);
                      setReferralError(null);
                    }}
                    style={{
                      width: '100%',
                      padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1rem, 3vw, 1.25rem)',
                      borderRadius: '16px',
                      border: referralError ? '2px solid rgba(239, 68, 68, 0.5)' : '2px solid rgba(255, 215, 0, 0.3)',
                        background: 'rgba(0, 0, 0, 0.3)',
                      color: '#fff',
                      fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                      outline: 'none',
                      transition: 'all 0.3s',
                      fontFamily: 'monospace'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'rgba(255, 215, 0, 0.6)';
                      e.target.style.background = 'rgba(0, 0, 0, 0.5)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = referralError ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 215, 0, 0.3)';
                      e.target.style.background = 'rgba(0, 0, 0, 0.3)';
                    }}
                  />
                  {referralError && (
                    <p style={{ color: '#ef4444', fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', margin: '-0.5rem 0 0 0', textAlign: 'center' }}>
                      {referralError}
                    </p>
                  )}
                  <button
                    onClick={handleReferralSubmit}
                    disabled={referralProcessing || !referralCode}
                    style={{
                      padding: 'clamp(0.875rem, 2vw, 1rem) clamp(1.5rem, 4vw, 2rem)',
                        borderRadius: '16px',
                      background: referralProcessing || !referralCode 
                        ? 'rgba(255, 255, 255, 0.1)' 
                        : 'linear-gradient(135deg, #FFD700, #FFA500)',
                      border: '2px solid rgba(255, 215, 0, 0.5)',
                      color: '#000',
                      fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                      fontWeight: 800,
                      cursor: referralProcessing || !referralCode ? 'not-allowed' : 'pointer',
                      transition: 'all 0.3s',
                      opacity: referralProcessing || !referralCode ? 0.6 : 1,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      width: '100%'
                    }}
                    onMouseEnter={(e) => {
                      if (!referralProcessing && referralCode) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 10px 30px rgba(255, 215, 0, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {referralProcessing ? 'Processing...' : 'Claim 50 BET Tokens'}
                  </button>
                  <p style={{ 
                    color: 'rgba(255, 255, 255, 0.6)', 
                    fontSize: 'clamp(0.7rem, 2vw, 0.75rem)', 
                    textAlign: 'center',
                    marginTop: 'clamp(0.25rem, 1vw, 0.5rem)'
                  }}>
                    You can skip this step if you don&apos;t have a referral code
                  </p>
                        </div>
                        </div>
            )}

            {/* Show success message if referral was submitted */}
            {address && referralSubmitted && (
              <div className="glass-card-dark" style={{ 
                padding: 'clamp(1.25rem, 3vw, 1.5rem)', 
                borderRadius: 'clamp(20px, 5vw, 24px)',
                border: '2px solid rgba(34, 197, 94, 0.3)',
                marginTop: 'clamp(1.5rem, 4vw, 3rem)',
                marginBottom: 'clamp(1.5rem, 4vw, 3rem)',
                background: 'rgba(34, 197, 94, 0.1)',
                animation: 'scale-in 0.6s ease-out'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.75rem, 2vw, 1rem)', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', flexShrink: 0 }}>✅</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#fff', fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', fontWeight: 700, margin: 0 }}>
                      Referral Code Applied!
                    </p>
                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 'clamp(0.8rem, 2vw, 0.875rem)', margin: 'clamp(0.125rem, 0.5vw, 0.25rem) 0 0 0' }}>
                      You&apos;ll receive 50 BET tokens when you make your first prediction
                    </p>
                      </div>
                </div>
              </div>
            )}

            {!data && !loading && (
              <div className="glass-card-dark" style={{ 
                textAlign: 'center', 
                padding: 'clamp(2rem, 6vw, 4rem) clamp(1.5rem, 4vw, 2rem)', 
                borderRadius: 'clamp(24px, 6vw, 32px)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                animation: 'scale-in 0.6s ease-out'
              }}>
                <div style={{ fontSize: 'clamp(3rem, 10vw, 4rem)', marginBottom: 'clamp(0.75rem, 2vw, 1rem)', animation: 'float 3s ease-in-out infinite' }}>🔮</div>
                <h3 className="shimmer-text" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)', marginBottom: 'clamp(0.25rem, 1vw, 0.5rem)', fontWeight: 800 }}>
                  Connect Your Wallet
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)' }}>
                  Connect your wallet to view your stats and start making predictions!
                </p>
          </div>
            )}
            {loading && (
              <div className="glass-card-dark" style={{ 
                textAlign: 'center', 
                padding: 'clamp(2rem, 6vw, 4rem) clamp(1.5rem, 4vw, 2rem)', 
                borderRadius: 'clamp(24px, 6vw, 32px)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                animation: 'scale-in 0.6s ease-out'
              }}>
                <div style={{ 
                  width: 'clamp(50px, 12vw, 60px)', 
                  height: 'clamp(50px, 12vw, 60px)', 
                  border: '4px solid rgba(255, 107, 53, 0.3)',
                  borderTop: '4px solid #ff6b35',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto clamp(1rem, 3vw, 1.5rem)'
                }} />
                <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 'clamp(0.95rem, 2.5vw, 1.1rem)', fontWeight: 600 }}>
                  Loading your stats...
                </p>
              </div>
            )}
              </>
            ) : null}
            
            {/* Dashboard content - only show when dashboard tab is active */}
            {activeTab === "dashboard" && (
              <>
                <PredictionsDashboard address={address || undefined} />
              </>
            )}
          </>
        )}
      </main>
    </>
  )
}


export default function Home() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1419 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"Georgia", "Times New Roman", "Times", serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 255, 255, 0.3)',
            borderTop: '3px solid #fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p>Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
