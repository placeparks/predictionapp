"use client";
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Clock, DollarSign, Target, X, TrendingUp, TrendingDown } from "lucide-react";
import { useSignTypedData, useChainId } from "wagmi";
import { keccak256, stringToBytes } from "viem";

type KalshiSeries = {
  title: string;
  event_title?: string;
  ticker?: string;
  series_ticker?: string;
  category?: string;
  milestones?: Array<{
    id?: string;
    title?: string;
    yes_bid?: number | null;
    no_bid?: number | null;
    last_price?: number | null;
    volume?: number | null;
    close_time?: string | null;
    live_type?: string | null;
  }>;
  total_series_volume?: number;
  total_volume?: number;
};

const API_SERIES = "/api/kalshi/series";
const API_TAGS = "/api/kalshi/tags";
const API_LIVE = "/api/kalshi/live";

const money = (n = 0) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
  : `$${Math.round(n)}`;

const timeUntil = (iso?: string | null) => {
  if (!iso) return "N/A";
  const d = new Date(iso).getTime() - Date.now();
  if (d <= 0) return "closed";
  const h = Math.floor(d / 3.6e6);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d`;
  const dt = new Date(iso);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const clampInt = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(n)));

const formatCents = (cents?: number | null) =>
  typeof cents === "number" ? `${clampInt(cents, 0, 100)}\u00A2` : "--";

type QuickTag = "all" | "politics" | "crypto" | "finance" | "economics" | "tech" | "sports" | "other";
type MarketFilterKey = "all" | "closing-soon" | "high-volume" | "expiring-today" | "new-this-week";

interface ExpiryTone {
  borderColor: string;
  glowColor: string;
  labelColor: string;
  badgeText: string;
  gradientColor: string;
}

const VIEW_SETTINGS_KEY = "kalshi_series_view_v1";
const FIRST_SEEN_KEY = "kalshi_series_first_seen_v1";
const HIGH_VOLUME_THRESHOLD = 100_000;
const NEW_SERIES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SPREAD_TRIGGER_THRESHOLD = 0.5;

const safeLower = (value?: string | null) => (value || "").toLowerCase();

const formatVolumeBadge = (value?: number | null) => {
  if (value === null || value === undefined) return null;
  const volume = Number(value);
  if (!Number.isFinite(volume) || volume <= 0) return null;
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(volume >= 10_000_000 ? 0 : 1)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(volume >= 100_000 ? 0 : 1)}K`;
  }
  return `${Math.round(volume)}`;
};

const computeHoursUntil = (iso?: string | null) => {
  if (!iso) return null;
  const delta = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(delta)) return null;
  return delta / 3.6e6;
};

const isExpiryToday = (iso?: string | null) => {
  if (!iso) return false;
  const expiry = new Date(iso);
  if (Number.isNaN(expiry.getTime())) return false;
  const now = new Date();
  return (
    expiry.getFullYear() === now.getFullYear() &&
    expiry.getMonth() === now.getMonth() &&
    expiry.getDate() === now.getDate() &&
    expiry.getTime() >= now.getTime()
  );
};

const isRecentlySeen = (map: Record<string, number>, key: string) => {
  const stored = map[key];
  if (!stored) return true;
  return Date.now() - stored <= NEW_SERIES_WINDOW_MS;
};

const getExpiryTone = (iso?: string | null): ExpiryTone => {
  const base: ExpiryTone = {
    borderColor: "rgba(99, 102, 241, 0.35)",
    glowColor: "rgba(99, 102, 241, 0.18)",
    labelColor: "rgba(255,255,255,0.65)",
    badgeText: "Open",
    gradientColor: "rgba(99, 102, 241, 0.18)",
  };
  const hours = computeHoursUntil(iso);
  if (hours === null) return base;
  if (hours <= 0) {
    return {
      borderColor: "rgba(100, 116, 139, 0.45)",
      glowColor: "rgba(100, 116, 139, 0.25)",
      labelColor: "#94a3b8",
      badgeText: "Expired",
      gradientColor: "rgba(100, 116, 139, 0.22)",
    };
  }
  if (hours <= 12) {
    return {
      borderColor: "rgba(239, 68, 68, 0.55)",
      glowColor: "rgba(239, 68, 68, 0.32)",
      labelColor: "#f87171",
      badgeText: "Final hours",
      gradientColor: "rgba(239, 68, 68, 0.25)",
    };
  }
  if (hours <= 48) {
    return {
      borderColor: "rgba(245, 158, 11, 0.5)",
      glowColor: "rgba(245, 158, 11, 0.28)",
      labelColor: "#fbbf24",
      badgeText: "Closing soon",
      gradientColor: "rgba(245, 158, 11, 0.22)",
    };
  }
  if (hours <= 96) {
    return {
      borderColor: "rgba(59, 130, 246, 0.45)",
      glowColor: "rgba(59, 130, 246, 0.24)",
      labelColor: "#93c5fd",
      badgeText: "This week",
      gradientColor: "rgba(59, 130, 246, 0.2)",
    };
  }
  return {
    borderColor: "rgba(16, 185, 129, 0.45)",
    glowColor: "rgba(16, 185, 129, 0.24)",
    labelColor: "#6ee7b7",
    badgeText: "Open",
    gradientColor: "rgba(16, 185, 129, 0.2)",
  };
};

const FAST_FILTER_OPTIONS: Array<{ id: MarketFilterKey; label: string }> = [
  { id: "all", label: "All markets" },
  { id: "closing-soon", label: "Closing soon" },
  { id: "high-volume", label: "High volume" },
  { id: "expiring-today", label: "My expiring today" },
  { id: "new-this-week", label: "New this week" },
];

// A small helper to normalize "next page/cursor" keys from the API
function getNextCursor(j: unknown): { cursor?: string; page?: number } {
  const obj = j as Record<string, unknown>;
  // common shapes
  if (typeof obj?.next === "string") return { cursor: obj.next };
  if (typeof obj?.next_cursor === "string") return { cursor: obj.next_cursor };
  if (typeof obj?.next_page_token === "string") return { cursor: obj.next_page_token };
  if (typeof obj?.cursor === "string") return { cursor: obj.cursor };
  if (typeof obj?.next_page === "number") return { page: obj.next_page };
  if (typeof obj?.page === "number" && typeof obj?.total_pages === "number" && obj.page < obj.total_pages) {
    return { page: obj.page + 1 };
  }
  return {};
}

interface KalshiPredictionsProps {
  address?: string;
}

export default function KalshiSeriesGrid({ address }: KalshiPredictionsProps) {
  const [_cats, setCats] = useState<string[]>(["all"]);
  const [cat, setCat] = useState<string>("all");
  const [quickTag, setQuickTag] = useState<QuickTag>("all");

  const [series, setSeries] = useState<KalshiSeries[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // paging state
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextCursorRef = useRef<string | undefined>(undefined);
  const nextPageRef = useRef<number | undefined>(undefined);

  // live cache
  const [liveCache, setLiveCache] = useState<Record<string, unknown>>({});

  // prediction state
  const [active, setActive] = useState<null | { 
    marketId: string; 
    marketTitle: string; 
    milestoneTitle?: string; 
    side: "yes" | "no";
    yes?: number | null; 
    no?: number | null;
  }>(null);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [predictOk, setPredictOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [energy, setEnergy] = useState<number>(0);
  const ENERGY_COST = 30; // Fixed cost per prediction
  const [fastFilter, setFastFilter] = useState<MarketFilterKey>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [myMarketTickers, setMyMarketTickers] = useState<string[]>([]);
  const [pulseMap, setPulseMap] = useState<Record<string, boolean>>({});
  const spreadHistoryRef = useRef<Record<string, number>>({});
  const pulseTimeoutRef = useRef<Record<string, number>>({});
  const [firstSeenMap, setFirstSeenMap] = useState<Record<string, number>>({});

  const applyQuickTag = useCallback((tag: QuickTag) => {
    setQuickTag(tag);
    switch (tag) {
      case "politics":
        setCat("Politics");
        break;
      case "crypto":
        setCat("Crypto");
        break;
      case "finance":
        setCat("Finance");
        break;
      case "economics":
        setCat("Economics");
        break;
      case "tech":
        setCat("Technology");
        break;
      case "sports":
        setCat("Sports");
        break;
      case "other":
      case "all":
      default:
        setCat("all");
        break;
    }
  }, [setCat]);

  const handleQuickTagClick = useCallback((tag: QuickTag) => {
    if (quickTag === tag) {
      applyQuickTag("all");
    } else {
      applyQuickTag(tag);
    }
  }, [applyQuickTag, quickTag]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(VIEW_SETTINGS_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { quickTag?: QuickTag; fastFilter?: MarketFilterKey; search?: string };
      if (parsed.quickTag) {
        applyQuickTag(parsed.quickTag);
      }
      if (parsed.fastFilter) {
        setFastFilter(parsed.fastFilter);
      }
      if (typeof parsed.search === "string") {
        setSearchTerm(parsed.search);
      }
    } catch (error) {
      console.error("Kalshi view restore failed", error);
    }
  }, [applyQuickTag]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        VIEW_SETTINGS_KEY,
        JSON.stringify({ quickTag, fastFilter, search: searchTerm })
      );
    } catch (error) {
      console.error("Kalshi view persist failed", error);
    }
  }, [quickTag, fastFilter, searchTerm]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(FIRST_SEEN_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, number>;
      setFirstSeenMap(parsed);
    } catch (error) {
      console.error("Kalshi first-seen restore failed", error);
    }
  }, []);

  useEffect(() => {
    const timeouts = pulseTimeoutRef.current;
    return () => {
      if (typeof window === "undefined") return;
      Object.values(timeouts).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  // wagmi hooks
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();

  // sentinel for IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ioRef = useRef<IntersectionObserver | null>(null);

  // Load categories (existing route)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(API_TAGS, { cache: "no-store" });
        const j = await r.json();
        const keys = j && typeof j === "object" ? Object.keys(j) : [];
        const list = ["all", ...new Set(keys)];
        setCats(list.length > 1 ? list : [
          "all","Politics","Sports","Economics","Finance","Technology","Entertainment","Science","Weather","Climate"
        ]);
      } catch {
        setCats(["all","Politics","Sports","Economics","Finance","Technology","Entertainment","Science","Weather","Climate"]);
      }
    })();
  }, []);

  // Reset list when category changes, then load first page
  useEffect(() => {
    setSeries([]);
    setErr(null);
    setHasMore(true);
    nextCursorRef.current = undefined;
    nextPageRef.current = undefined;
    setInitialLoading(true);

    void loadPage({ replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  useEffect(() => {
    if (!address) {
      setMyMarketTickers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/predictions?user=${address}`);
        if (!res.ok) {
          if (!cancelled) setMyMarketTickers([]);
          return;
        }
        const payload = await res.json();
        const predictionsList = Array.isArray(payload?.predictions) ? payload.predictions : [];
        const tickers = new Set<string>();
        predictionsList.forEach((item: Record<string, unknown>) => {
          const rawTicker =
            typeof item?.market_ticker === "string" ? item.market_ticker :
            typeof item?.market_title === "string" ? item.market_title :
            typeof item?.market_id === "string" ? item.market_id :
            null;
          if (rawTicker) tickers.add(rawTicker.toLowerCase());
        });
        if (!cancelled) {
          setMyMarketTickers(Array.from(tickers));
        }
      } catch (error) {
        if (!cancelled) {
          setMyMarketTickers([]);
        }
        console.error("Kalshi predictions fetch failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Build query for current category + paging
  const buildQueryString = () => {
    const qs = new URLSearchParams({
      order_by: "trending",
      status: "open,unopened",
      page_size: "50",
      with_milestones: "true",
      hydrate: "milestones",
    });
    if (cat && cat !== "all") qs.set("category", cat);
    if (nextCursorRef.current) qs.set("cursor", nextCursorRef.current);
    if (typeof nextPageRef.current === "number") qs.set("page", String(nextPageRef.current));
    return qs.toString();
  };

  // Core loader (can replace or append)
  const loadPage = useCallback(async ({ replace = false }: { replace?: boolean } = {}) => {
    // prevent duplicate fetches
    if (!replace && (loadingMore || !hasMore)) return;
    if (replace) {
      setInitialLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const qs = buildQueryString();
      const r = await fetch(`${API_SERIES}?${qs}`, { cache: "no-store" });
      const j = await r.json();

      const rows: KalshiSeries[] = j?.series ?? j?.results ?? j?.items ?? j?.current_page ?? [];
      const { cursor, page } = getNextCursor(j);

      // Update paging cursors
      nextCursorRef.current = cursor;
      nextPageRef.current = page;

      const got = Array.isArray(rows) ? rows : [];
      setSeries(prev => (replace ? got : [...prev, ...got]));

      // Has more?
      const more =
        (typeof cursor === "string" && cursor.length > 0) ||
        (typeof page === "number") ||
        // fallback heuristic: if we received a full page, assume more
        got.length >= 50;

      setHasMore(more);
      setErr(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load series";
      setErr(message);
      setHasMore(false);
    } finally {
      if (replace) {
        setInitialLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, hasMore, loadingMore]);

  // IntersectionObserver to auto-load when reaching the end
  useEffect(() => {
    if (!sentinelRef.current) return;

    if (ioRef.current) {
      ioRef.current.disconnect();
      ioRef.current = null;
    }

    ioRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loadingMore && !initialLoading) {
          void loadPage();
        }
      },
      { root: null, rootMargin: "300px", threshold: 0 } // prefetch ~300px before bottom
    );

    ioRef.current.observe(sentinelRef.current);

    return () => {
      if (ioRef.current) {
        ioRef.current.disconnect();
        ioRef.current = null;
      }
    };
  }, [hasMore, loadingMore, initialLoading, loadPage]);

  // Fetch energy
  useEffect(() => {
    if (!address) {
      setEnergy(0);
      return;
    }
    async function fetchEnergy() {
      try {
        const r = await fetch(`/api/energy?user=${address}`);
        if (!r.ok) return;
        const j = await r.json();
        if (j?.ok) {
          setEnergy(Number(j?.energy ?? 0));
        }
      } catch {}
    }
    fetchEnergy();
    // Listen for energy-updated events
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

  // Lazy-load live milestone data
  const fetchLive = async (type: string, id: string) => {
    const key = `${type}:${id}`;
    if (liveCache[key]) return;
    const r = await fetch(`${API_LIVE}?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await r.json();
    setLiveCache(prev => ({ ...prev, [key]: j?.data ?? j }));
  };

  // Handle prediction
  const handlePrediction = (marketId: string, marketTitle: string, milestoneTitle: string | undefined, side: "yes" | "no", yes?: number | null, no?: number | null) => {
    setPredictError(null);
    setPredictOk(null);
    setActive({ marketId, marketTitle, milestoneTitle, side, yes, no });
  };

  // Submit prediction
  async function submitPrediction() {
    try {
      if (!active || !address) {
        setPredictError("Connect wallet to record predictions");
        return;
      }
      // Check energy before submitting
      if (energy < ENERGY_COST) {
        setPredictError(`You need ${ENERGY_COST} energy to make a prediction. You have ${energy} energy. Energy refills 10 units every 15 minutes (Tier 4/5: every 10 minutes).`);
        return;
      }
      const REGISTRY = process.env.NEXT_PUBLIC_FORECAST_REGISTRY;
      const VAULT_ID = Number(process.env.NEXT_PUBLIC_FORECAST_VAULT_ID || "0");
      const PERIOD_ID = Number(process.env.NEXT_PUBLIC_CURRENT_PERIOD_ID || "1");
      if (!REGISTRY || REGISTRY.length !== 42) {
        setPredictError("Missing NEXT_PUBLIC_FORECAST_REGISTRY in .env");
        return;
      }
      const marketId = keccak256(stringToBytes(active.marketId));
      const nowSec = Math.floor(Date.now() / 1000);
      const deadline = nowSec + 3600;
      const nonce = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
      const domain = { name: "ForecastFund", version: "1", chainId, verifyingContract: REGISTRY as `0x${string}` } as const;
      const types = {
        Record: [
          { name: "user", type: "address" },
          { name: "vaultId", type: "uint256" },
          { name: "periodId", type: "uint64" },
          { name: "marketId", type: "bytes32" },
          { name: "sideYes", type: "bool" },
          { name: "stakePoints", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      } as const;
      const message = {
        user: address as `0x${string}`,
        vaultId: BigInt(VAULT_ID),
        periodId: BigInt(PERIOD_ID),
        marketId: marketId as `0x${string}`,
        sideYes: active.side === "yes",
        stakePoints: BigInt(ENERGY_COST), // Fixed 30 energy cost
        nonce,
        deadline: BigInt(deadline)
      } as const;
      setPending(true);
      const signature = await signTypedDataAsync({ domain, types, primaryType: "Record", message });
      // Convert BigInt values to strings for JSON serialization
      const messageForApi = {
        user: message.user,
        vaultId: message.vaultId.toString(),
        periodId: message.periodId.toString(),
        marketId: message.marketId,
        sideYes: message.sideYes,
        stakePoints: message.stakePoints.toString(),
        nonce: message.nonce.toString(),
        deadline: message.deadline.toString(),
      };
      // Get referral code from localStorage if available
      let referralCode: string | undefined;
      try {
        const storedRef = localStorage.getItem("referral_code");
        if (storedRef && storedRef.trim().length > 0) {
          referralCode = storedRef.trim();
        }
      } catch {
        // localStorage access failed, ignore
      }

      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          typesName: "Record",
          types,
          message: messageForApi,
          signature,
          marketTitle: active.marketTitle,
          marketTicker: active.marketId,
          referralCode // Include referral code if available (can be PROPH-XXXXX or wallet address for backward compatibility)
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const errorMsg = j?.message || j?.error || `HTTP ${res.status}`;
        console.error("Prediction API error:", { status: res.status, error: j });
        throw new Error(errorMsg);
      }
      setPredictOk("Prediction recorded");
      setActive(null);
      // Refresh energy after successful prediction
      if (address) {
        const r = await fetch(`/api/energy?user=${address}`);
        if (r.ok) {
          const j = await r.json();
          if (j?.ok) {
            setEnergy(Number(j?.energy ?? 0));
          }
        }
        // Trigger a custom event to refresh HeaderEnergy in the parent
        window.dispatchEvent(new CustomEvent('energy-updated', { detail: { address } }));
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to record prediction";
      console.error("Prediction submission error:", e);
      setPredictError(errorMsg);
    } finally {
      setPending(false);
    }
  }

  const grid = useMemo(() => series.map((s, index) => {
    const title = s.title || s.event_title || "â€”";
    const ticker = s.ticker || s.series_ticker || "";
    const ms = (s.milestones ?? []).slice(0, 4);
    const totalVol =
      (s.total_series_volume ?? s.total_volume) ??
      (ms.reduce((t, m) => t + (m?.volume || 0), 0) || 0);

    const soonest = ms
      .map(m => m.close_time ? new Date(m.close_time).getTime() : Infinity)
      .reduce((a, b) => Math.min(a, b), Infinity);

    const closeIso = Number.isFinite(soonest) ? new Date(soonest).toISOString() : null;
    const href = `https://kalshi.com/calendar?search=${encodeURIComponent(ticker || title)}`;
    const category = (s.category || "other").toLowerCase();

    const primary = ms.find(m => (typeof m.yes_bid === "number") || (typeof m.last_price === "number")) || ms[0];

    const yesCents = (typeof primary?.yes_bid === "number")
      ? primary?.yes_bid
      : (typeof primary?.last_price === "number" ? primary?.last_price : undefined);
    const noCents = (typeof primary?.no_bid === "number")
      ? primary?.no_bid
      : (typeof yesCents === "number" ? Math.max(0, 100 - yesCents) : undefined);

    const keyBase = safeLower(ticker || (ms[0]?.id || title));
    const key = keyBase || `series-${index}`;
    const spread =
      typeof yesCents === "number" && typeof noCents === "number"
        ? Math.abs(yesCents - noCents)
        : null;

    return { key, title, s, ms, totalVol, closeIso, href, category, yesCents, noCents, primary, spread };
  }), [series]);

  const PRIMARY_MAP = useMemo(() => new Set(["politics", "crypto", "macro", "economics", "finance", "tech", "sports"]), []);
  const myTickerSet = useMemo(() => new Set(myMarketTickers.map((t) => t.toLowerCase())), [myMarketTickers]);
  const searchNormalized = useMemo(() => searchTerm.trim().toLowerCase(), [searchTerm]);

  const categoryFilteredGrid = useMemo(() => {
    if (quickTag === "all") return grid;

    if (quickTag === "politics" || quickTag === "crypto" || quickTag === "finance" ||
        quickTag === "economics" || quickTag === "tech" || quickTag === "sports") {
      return grid.filter(g => safeLower(g.s.category) === quickTag);
    }

    return grid.filter(g => !PRIMARY_MAP.has(safeLower(g.s.category || "other")));
  }, [grid, quickTag, PRIMARY_MAP]);

  const filteredGrid = useMemo(() => {
    let scoped = categoryFilteredGrid;

    if (searchNormalized) {
      scoped = scoped.filter(({ title, s, ms }) => {
        const titleMatch = safeLower(title).includes(searchNormalized);
        const tickerMatch = safeLower(s.ticker || s.series_ticker || "").includes(searchNormalized);
        const milestoneMatch = ms.some((m) => safeLower(m?.title).includes(searchNormalized));
        return titleMatch || tickerMatch || milestoneMatch;
      });
    }

    if (fastFilter === "closing-soon") {
      scoped = scoped.filter(({ closeIso }) => {
        const hours = computeHoursUntil(closeIso);
        return hours !== null && hours > 0 && hours <= 48;
      });
    } else if (fastFilter === "high-volume") {
      scoped = scoped.filter(({ totalVol }) => totalVol >= HIGH_VOLUME_THRESHOLD);
    } else if (fastFilter === "expiring-today") {
      scoped = scoped.filter(({ closeIso, s }) => {
        if (!isExpiryToday(closeIso)) return false;
        const ticketKey = safeLower(s.ticker || s.series_ticker || "");
        return ticketKey ? myTickerSet.has(ticketKey) : false;
      });
    } else if (fastFilter === "new-this-week") {
      scoped = scoped.filter(({ key }) => isRecentlySeen(firstSeenMap, key));
    }

    return scoped;
  }, [categoryFilteredGrid, searchNormalized, fastFilter, myTickerSet, firstSeenMap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setFirstSeenMap(prev => {
      const next = { ...prev };
      let changed = false;
      const now = Date.now();
      grid.forEach(({ key }) => {
        if (key && !next[key]) {
          next[key] = now;
          changed = true;
        }
      });
      if (changed) {
        try {
          window.localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify(next));
        } catch (error) {
          console.error("Kalshi first-seen persist failed", error);
        }
        return next;
      }
      return prev;
    });
  }, [grid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const triggered: string[] = [];
    const history = spreadHistoryRef.current;

    grid.forEach(({ key, spread }) => {
      if (!key || typeof spread !== "number") return;
      const previous = history[key];
      if (typeof previous === "number" && spread < previous - SPREAD_TRIGGER_THRESHOLD) {
        triggered.push(key);
      }
      history[key] = spread;
    });

    if (!triggered.length) return;

    setPulseMap(prev => {
      const next = { ...prev };
      triggered.forEach((key) => {
        next[key] = true;
      });
      return next;
    });

    triggered.forEach((key) => {
      if (pulseTimeoutRef.current[key]) {
        window.clearTimeout(pulseTimeoutRef.current[key]);
      }
      pulseTimeoutRef.current[key] = window.setTimeout(() => {
        setPulseMap(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        delete pulseTimeoutRef.current[key];
      }, 2000);
    });
  }, [grid]);

  if (initialLoading) return (
    <div style={{ textAlign: "center", padding: "3rem" }}>
      <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 1rem" }} />
      <p style={{ color: "rgba(255, 255, 255, 0.8)" }}>Loading...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header + Category Filter */}
      <div style={{ background: "rgba(15, 20, 35, 0.6)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: 16, padding: "1.25rem 1.5rem", backdropFilter: "blur(10px)" }}>
        <style>{`
          @media (max-width: 640px) {
            .series-header h2 { font-size: 1.25rem !important; }
          }
        `}</style>

        <div className="series-header" style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <Target size={28} color="#6366f1" />
          <div>
            <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>Trending Series</h2>
          </div>
        </div>

        {/* Quick Tags */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          {[
            { id: "politics", label: "Politics" },
            { id: "crypto", label: "Crypto" },
            { id: "finance", label: "Finance" },
            { id: "economics", label: "Economics" },
            { id: "tech", label: "Tech" },
            { id: "sports", label: "Sports" },
            { id: "other", label: "Other" },
          ].map(btn => {
            const active = quickTag === (btn.id as QuickTag);
            return (
              <button
                key={btn.id}
                onClick={() => handleQuickTagClick(btn.id as QuickTag)}
                style={{
                  padding: "0.45rem 0.9rem",
                  background: active ? "rgba(99, 102, 241, 0.22)" : "rgba(255,255,255,0.05)",
                  border: active ? "1px solid rgba(99, 102, 241, 0.55)" : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  transition: "all 0.2s"
                }}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 16,
            alignItems: "center"
          }}
        >
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search markets or milestones..."
            autoComplete="off"
            style={{
              flex: "1 1 220px",
              minWidth: 200,
              padding: "0.5rem 0.75rem",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(15, 20, 35, 0.65)",
              color: "#fff",
              fontSize: "0.85rem",
              outline: "none",
              boxShadow: "inset 0 0 0 1px rgba(99,102,241,0.1)"
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {FAST_FILTER_OPTIONS.map((option) => {
              const active = fastFilter === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => setFastFilter(prev => prev === option.id ? "all" : option.id)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: 10,
                    border: active ? "1px solid rgba(16, 185, 129, 0.45)" : "1px solid rgba(255,255,255,0.12)",
                    background: active ? "rgba(16, 185, 129, 0.22)" : "rgba(255,255,255,0.05)",
                    color: active ? "#6ee7b7" : "rgba(255,255,255,0.75)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  title={option.label}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {err && (
        <div style={{ background: "rgba(245,87,108,0.2)", border: "1px solid rgba(245,87,108,0.5)", borderRadius: 12, padding: "1rem", textAlign: "center" }}>
          <div style={{ color: "#fff", marginBottom: 6 }}>Failed to load</div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{err}</div>
        </div>
      )}

      {!err && grid.length === 0 ? (
        <div style={{ background: "rgba(0,0,0,0.2)", border: "2px dashed rgba(255,255,255,0.3)", borderRadius: 16, padding: "3rem", textAlign: "center", backdropFilter: "blur(10px)" }}>
          <Target size={48} color="rgba(255,255,255,0.5)" style={{ marginBottom: "1rem" }} />
          <p style={{ margin: 0, color: "rgba(255,255,255,0.7)" }}>No items for this filter</p>
        </div>
      ) : (
        <>
          <style>{`
            .series-grid {
              display: grid;
              gap: 1rem;
              grid-template-columns: 1fr;
            }
            
            @media (min-width: 641px) {
              .series-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 1rem;
              }
            }
            
            @media (min-width: 1025px) {
              .series-grid {
                grid-template-columns: repeat(4, 1fr);
                gap: 1rem;
              }
            }
            
            @media (max-width: 640px) {
              .series-grid { gap: 0.75rem !important; }
              .series-card { padding: 0.75rem !important; }
              .series-card header { padding: 0.75rem 1rem 0.5rem !important; }
              .series-card h3 { font-size: 1rem !important; }
              .series-card .metadata { font-size: 0.7rem !important; gap: 0.75rem !important; }
              .series-modal { padding: 1rem !important; margin: 1rem !important; }
            }

            @keyframes seriesPulse {
              0% {
                transform: translateY(0);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
              }
              50% {
                transform: translateY(-2px);
                box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25), 0 16px 34px rgba(0, 0, 0, 0.3);
              }
              100% {
                transform: translateY(0);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
              }
            }
          `}</style>

          <div className="series-grid">
            {filteredGrid.map((entry, index) => {
              const { key, title, s, ms, totalVol, closeIso, href, category, primary } = entry;
              const cardKey = key || `series-${index}`;
              const catColor = ({
                crypto: "#10b981", politics: "#6366f1", macro: "#3b82f6",
                economics: "#14b8a6", finance: "#8b5cf6", tech: "#f59e0b",
                sports: "#ef4444", other: "#64748b",
              } as Record<string, string>)[category] || "#6366f1";
              const tone = getExpiryTone(closeIso);
              const pulseActive = Boolean(key && pulseMap[key]);
              const volumeBadge = formatVolumeBadge(totalVol);
              const cardBackground = `linear-gradient(90deg, ${tone.gradientColor} 0%, rgba(15, 20, 35, 0) 55%), rgba(255, 255, 255, 0.03)`;
              const defaultBorder = pulseActive ? tone.borderColor : "rgba(255, 255, 255, 0.1)";

              return (
                <article key={cardKey} className="series-card"
                  style={{
                    background: cardBackground,
                    border: `1px solid ${defaultBorder}`,
                    borderLeft: `3px solid ${tone.borderColor}`,
                    borderRadius: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    transition: "all 0.2s",
                    overflow: "hidden",
                    minWidth: 0,
                    boxShadow: pulseActive
                      ? `0 0 0 1px ${tone.glowColor}, 0 14px 32px rgba(0, 0, 0, 0.28)`
                      : "0 2px 8px rgba(0, 0, 0, 0.15)",
                    animation: pulseActive ? "seriesPulse 0.95s ease-in-out 2" : "none"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = tone.borderColor;
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.25)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = defaultBorder;
                    e.currentTarget.style.boxShadow = pulseActive
                      ? `0 0 0 1px ${tone.glowColor}, 0 14px 32px rgba(0, 0, 0, 0.28)`
                      : "0 2px 8px rgba(0, 0, 0, 0.15)";
                  }}
                >
                  <header style={{
                    padding: "1rem 1.25rem 0.75rem",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    background: "rgba(255, 255, 255, 0.02)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{
                        display: "inline-block",
                        padding: "0.35rem 0.75rem",
                        background: "transparent",
                        borderRadius: 0,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 1.2,
                        marginBottom: 0,
                        color: catColor,
                        borderBottom: `2px solid ${catColor}`
                      }}>
                        {s.category || "other"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: tone.labelColor,
                          border: `1px solid ${tone.borderColor}`,
                          borderRadius: 999,
                          padding: "0.25rem 0.6rem",
                          background: "rgba(15, 20, 35, 0.6)"
                        }}>
                          {tone.badgeText}
                        </span>
                        {volumeBadge && (
                          <span
                            title={`Total volume ${Math.round(totalVol).toLocaleString()}`}
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "#fbbf24",
                              border: "1px solid rgba(251,191,36,0.4)",
                              borderRadius: 999,
                              padding: "0.25rem 0.6rem",
                              background: "rgba(251,191,36,0.15)"
                            }}
                          >
                            Vol {volumeBadge}
                          </span>
                        )}
                      </div>
                    </div>
                  </header>

                  <div style={{ padding: "1.25rem", flex: 1, display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0, overflow: "hidden" }}>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <h3 style={{
                        margin: "0 0 0.5rem 0",
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: "#fff",
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        hyphens: "auto",
                        fontFamily: '"Georgia", "Times New Roman", serif'
                      }}>
                        {title}
                      </h3>
                    </div>

                    <div className="metadata" style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 16,
                      fontSize: "0.75rem",
                      color: "rgba(255,255,255,0.55)",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid rgba(255, 255, 255, 0.05)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: tone.labelColor }} title={closeIso ? new Date(closeIso).toLocaleString() : undefined}>
                        <Clock size={12} /> {timeUntil(closeIso)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <DollarSign size={12} /> {money(totalVol)}
                      </div>
                    </div>

                    {primary && (
                      <div style={{
                        display: "flex",
                        gap: 12,
                        fontSize: "0.75rem",
                        color: "rgba(255,255,255,0.7)",
                        padding: "0.75rem",
                        background: "rgba(255, 255, 255, 0.04)",
                        borderRadius: 0,
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderLeft: "3px solid rgba(99, 102, 241, 0.5)"
                      }}>
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div style={{ color: "#10b981", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                            YES: {formatCents((typeof primary.yes_bid === "number") ? primary.yes_bid : (typeof primary.last_price === "number" ? primary.last_price : undefined))}
                          </div>
                          <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                            {primary.title || "â€”"}
                          </div>
                        </div>
                        <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div style={{ color: "#ef4444", fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                            NO: {formatCents((typeof primary.no_bid === "number") ? primary.no_bid : (typeof primary.yes_bid === "number" ? Math.max(0, 100 - primary.yes_bid) : (typeof primary.last_price === "number" ? Math.max(0, 100 - primary.last_price) : undefined)))}
                          </div>
                          <div style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                            Volume: {money(primary?.volume ?? 0)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prediction buttons for primary milestone */}
                    {primary && address && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: "0.5rem" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const marketId = s.ticker || s.series_ticker || title;
                            handlePrediction(
                              marketId,
                              title,
                              primary.title,
                              "yes",
                              typeof primary.yes_bid === "number" ? primary.yes_bid : (typeof primary.last_price === "number" ? primary.last_price : undefined),
                              typeof primary.no_bid === "number" ? primary.no_bid : (typeof primary.yes_bid === "number" ? Math.max(0, 100 - primary.yes_bid) : (typeof primary.last_price === "number" ? Math.max(0, 100 - primary.last_price) : undefined))
                            );
                          }}
                          style={{
                            padding: "0.875rem",
                            background: "transparent",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            borderRadius: 0,
                            color: "#10b981",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 6,
                            transition: "all 0.2s",
                            textTransform: "uppercase",
                            letterSpacing: 0.5
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(16, 185, 129, 0.1)";
                            e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.5)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.3)";
                          }}
                        >
                          <span style={{ fontSize: "0.7rem", opacity: 0.8, display: "flex", alignItems: "center", gap: 4 }}>
                            <TrendingUp size={14} /> YES
                          </span>
                          <span style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: 0 }}>
                            {formatCents((typeof primary.yes_bid === "number") ? primary.yes_bid : (typeof primary.last_price === "number" ? primary.last_price : undefined))}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const marketId = s.ticker || s.series_ticker || title;
                            handlePrediction(
                              marketId,
                              title,
                              primary.title,
                              "no",
                              typeof primary.yes_bid === "number" ? primary.yes_bid : (typeof primary.last_price === "number" ? primary.last_price : undefined),
                              typeof primary.no_bid === "number" ? primary.no_bid : (typeof primary.yes_bid === "number" ? Math.max(0, 100 - primary.yes_bid) : (typeof primary.last_price === "number" ? Math.max(0, 100 - primary.last_price) : undefined))
                            );
                          }}
                          style={{
                            padding: "0.875rem",
                            background: "transparent",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            borderRadius: 0,
                            color: "#ef4444",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 6,
                            transition: "all 0.2s",
                            textTransform: "uppercase",
                            letterSpacing: 0.5
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                            e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.5)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                          }}
                        >
                          <span style={{ fontSize: "0.7rem", opacity: 0.8, display: "flex", alignItems: "center", gap: 4 }}>
                            <TrendingDown size={14} /> NO
                          </span>
                          <span style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: 0 }}>
                            {formatCents((typeof primary.no_bid === "number") ? primary.no_bid : (typeof primary.yes_bid === "number" ? Math.max(0, 100 - primary.yes_bid) : (typeof primary.last_price === "number" ? Math.max(0, 100 - primary.last_price) : undefined)))}
                          </span>
                        </button>
                      </div>
                    )}

                    <div className="space-y-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {ms.map((m, k) => {
                        const yesTxt =
                          typeof m.yes_bid === "number" ? `Yes ${m.yes_bid}Â¢` :
                          typeof m.last_price === "number" ? `Yes ${m.last_price}Â¢` : "Yes â€”";
                        const liveKey = m.live_type && m.id ? `${m.live_type}:${m.id}` : "";
                        const live = liveKey ? liveCache[liveKey] : null;

                        return (
                          <div key={k} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0.6rem 0.75rem", background: "rgba(255,255,255,0.03)" }}>
                            <div style={{ fontSize: "0.9rem" }}>{m.title || "â€”"}</div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)" }}>{yesTxt}</div>
                              <div style={{ display: "flex", gap: 8 }}>
                                {m.live_type && m.id && (
                                  <button
                                    onClick={() => fetchLive(m.live_type!, m.id!)}
                                    style={{
                                      fontSize: 12, padding: "4px 8px", borderRadius: 8,
                                      background: "rgba(16,185,129,0.2)", color: "#10b981",
                                      border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer"
                                    }}
                                  >
                                    {live ? "Live âœ“" : "Load Live"}
                                  </button>
                                )}
                                {address && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const marketId = s.ticker || s.series_ticker || title;
                                        handlePrediction(
                                          marketId,
                                          title,
                                          m.title,
                                          "yes",
                                          m.yes_bid ?? m.last_price ?? null,
                                          (typeof m.no_bid === "number") ? m.no_bid : (typeof (m.yes_bid ?? m.last_price) === "number" ? Math.max(0, 100 - (m.yes_bid ?? m.last_price)!) : null)
                                        );
                                      }}
                                      style={{
                                        fontSize: 12, padding: "4px 8px", borderRadius: 8,
                                        background: "rgba(16,185,129,0.2)", color: "#10b981",
                                        border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer"
                                      }}
                                    >
                                      Bet YES
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const marketId = s.ticker || s.series_ticker || title;
                                        handlePrediction(
                                          marketId,
                                          title,
                                          m.title,
                                          "no",
                                          m.yes_bid ?? m.last_price ?? null,
                                          (typeof m.no_bid === "number") ? m.no_bid : (typeof (m.yes_bid ?? m.last_price) === "number" ? Math.max(0, 100 - (m.yes_bid ?? m.last_price)!) : null)
                                        );
                                      }}
                                      style={{
                                        fontSize: 12, padding: "4px 8px", borderRadius: 8,
                                        background: "rgba(239,68,68,0.2)", color: "#ef4444",
                                        border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer"
                                      }}
                                    >
                                      Bet NO
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {live != null && (
                              <pre style={{ marginTop: 8, fontSize: 11, lineHeight: 1.2, color: "rgba(255,255,255,0.9)", overflowX: "auto" }}>
                                {JSON.stringify(live as Record<string, unknown>, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <a href={href} target="_blank" rel="noreferrer" style={{ marginTop: 10, fontSize: 13, color: "#93c5fd", textDecoration: "underline" }}>
                      Open on Kalshi
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Sentinel for IntersectionObserver */}
          <div ref={sentinelRef} />

          {/* Bottom loader + manual fallback */}
          <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
            {loadingMore && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.8)" }}>
                <div style={{ width: 24, height: 24, border: "3px solid rgba(255,255,255,0.25)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                Loading more...
              </div>
            )}
            {!loadingMore && hasMore && (
              <button
                onClick={() => loadPage()}
                style={{ padding: "10px 16px", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontWeight: 600, cursor: "pointer" }}
              >
                Load more
              </button>
            )}
            {!hasMore && (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Thatâ€™s all for now</div>
            )}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}

      {active && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={() => setActive(null)}>
          <div onClick={(e)=>e.stopPropagation()} className="series-modal" style={{ width: "100%", maxWidth: 420, background: "rgba(15, 20, 35, 0.95)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: 16, padding: 20, color: "#fff", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>Record Prediction</div>
              <button onClick={() => setActive(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 12, lineHeight: 1.5, wordBreak: "break-word", overflowWrap: "break-word", hyphens: "auto" }}>
              {active.marketTitle}
            </div>
            {active.milestoneTitle && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                Milestone: <strong>{active.milestoneTitle}</strong>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <div style={{ padding: "6px 12px", borderRadius: 8, background: active.side === "yes" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)", border: `1px solid ${active.side === "yes" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`, color: active.side === "yes" ? "#10b981" : "#ef4444" }}>
                Side: <strong>{active.side.toUpperCase()}</strong>
              </div>
              <div style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.3)", color: "#6366f1" }}>
                Price: <strong>{formatCents(active.side === "yes" ? active.yes : active.no)}</strong>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>
                ⚡ Energy Cost: {ENERGY_COST} (Your Energy: {energy})
              </label>
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.3)", marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>⚡ Energy Cost:</span>
                  <strong style={{ color: "#fff", fontSize: "1rem" }}>{ENERGY_COST}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>Your Energy:</span>
                  <strong style={{ color: energy >= ENERGY_COST ? "#10b981" : "#ef4444", fontSize: "0.9rem" }}>
                    {energy}/{ENERGY_COST} {energy >= ENERGY_COST ? "✓" : "✗"}
                  </strong>
                </div>
              </div>
            </div>
            {predictError && (
              <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", color: "#ef4444", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: "0.875rem" }}>
                {predictError}
              </div>
            )}
            {predictOk && (
              <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", color: "#10b981", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: "0.875rem" }}>
                {predictOk}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setActive(null)}
                style={{
                  padding: "10px 18px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8,
                  color: "rgba(255,255,255,0.8)",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
              >
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={submitPrediction}
                style={{
                  padding: "10px 18px",
                  background: pending ? "rgba(99, 102, 241, 0.3)" : "rgba(99, 102, 241, 0.8)",
                  border: "1px solid rgba(99, 102, 241, 0.5)",
                  borderRadius: 8,
                  color: "#fff",
                  cursor: pending ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  if (!pending) e.currentTarget.style.background = "rgba(99, 102, 241, 1)";
                }}
                onMouseLeave={(e) => {
                  if (!pending) e.currentTarget.style.background = "rgba(99, 102, 241, 0.8)";
                }}
              >
                {pending ? "Signingâ€¦" : "Sign & Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
