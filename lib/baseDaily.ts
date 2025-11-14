// lib/baseDaily.ts

// ----- CONFIG -----
export const TEST_MODE = process.env.NEXT_PUBLIC_BASE_DAILY_TEST === "1";

const MINUTE_MS = 60_000;
const SESSION_LENGTH_MINUTES =
  Number(process.env.NEXT_PUBLIC_BASE_DAILY_TEST_MINUTES ?? (TEST_MODE ? 20 : 1440));
export const SESSION_LOCK_BUFFER_MINUTES =
  Number(process.env.NEXT_PUBLIC_BASE_DAILY_LOCK_BUFFER_MINUTES ?? (TEST_MODE ? 2 : 5));
export const SESSION_BREAK_MINUTES =
  Number(process.env.NEXT_PUBLIC_BASE_DAILY_BREAK_MINUTES ?? (TEST_MODE ? 1 : 10));

export const SESSION_MS = SESSION_LENGTH_MINUTES * MINUTE_MS;

// ----- ID HELPERS -----
export function formatSessionId(date: Date): string {
  if (TEST_MODE) {
    // YYYY-MM-DD-HH:MM  (aligned to session bucket start)
    const iso = new Date(date).toISOString().slice(0, 16);
    return iso.replace("T", "-");
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

export function parseSessionId(sessionId: string): Date | null {
  if (!sessionId) return null;
  if (TEST_MODE) {
    const m = sessionId.match(/^(\d{4}-\d{2}-\d{2})-(\d{2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`);
    return isNaN(+d) ? null : d;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionId)) return null;
  const d = new Date(`${sessionId}T00:00:00Z`);
  return isNaN(+d) ? null : d;
}

export function previousSessionId(sessionId: string): string {
  const base = parseSessionId(sessionId);
  if (!base) return sessionId;
  const prev = new Date(base.getTime() - SESSION_MS);
  return formatSessionId(prev);
}

export function nextSessionId(sessionId: string): string {
  const base = parseSessionId(sessionId);
  if (!base) return sessionId;
  const next = new Date(base.getTime() + SESSION_MS);
  return formatSessionId(next);
}

export function isValidSessionId(sessionId: string): boolean {
  return parseSessionId(sessionId) !== null;
}

// ----- PHASE / TIMING -----
export type BaseDailyPhase = "break" | "open" | "locked";
export interface BaseDailySession {
  sessionId: string;
  breakStart: Date;
  openAt: Date;
  closeAt: Date;
  lockAt: Date;
  resolveAt: Date;
  nextOpenAt: Date;
  phase: BaseDailyPhase;
}

export function computeBaseDailySession(nowInput: Date | string | number = new Date()): BaseDailySession {
  const now = new Date(nowInput);

  if (!TEST_MODE) {
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const breakStart = midnight;
    const openAt = new Date(midnight.getTime() + SESSION_BREAK_MINUTES * MINUTE_MS);
    const resolveAt = new Date(midnight.getTime() + SESSION_MS);
    const lockAt = new Date(resolveAt.getTime() - SESSION_LOCK_BUFFER_MINUTES * MINUTE_MS);
    const nextOpenAt = new Date(resolveAt.getTime() + SESSION_BREAK_MINUTES * MINUTE_MS);
    const phase: BaseDailyPhase = now < openAt ? "break" : now < lockAt ? "open" : "locked";

    return { sessionId: formatSessionId(midnight), breakStart, openAt, closeAt: lockAt, lockAt, resolveAt, nextOpenAt, phase };
  }

  // test mode: rolling N-minute buckets aligned to UTC
  const epoch = Math.floor(now.getTime() / SESSION_MS) * SESSION_MS;
  const bucketStart = new Date(epoch);
  const breakStart = bucketStart;
  const openAt = new Date(bucketStart.getTime() + SESSION_BREAK_MINUTES * MINUTE_MS);
  const resolveAt = new Date(bucketStart.getTime() + SESSION_MS);
  const lockAt = new Date(resolveAt.getTime() - SESSION_LOCK_BUFFER_MINUTES * MINUTE_MS);
  const nextOpenAt = new Date(resolveAt.getTime() + SESSION_BREAK_MINUTES * MINUTE_MS);
  const phase: BaseDailyPhase = now < openAt ? "break" : now < lockAt ? "open" : "locked";

  return { sessionId: formatSessionId(bucketStart), breakStart, openAt, closeAt: lockAt, lockAt, resolveAt, nextOpenAt, phase };
}

// ----- MARKETS -----
export interface BaseDailyMarket {
  id: string;
  title: string;
  description: string;
  category: string;
  yesLabel?: string;
  noLabel?: string;
}

export const BASE_DAILY_MARKETS: BaseDailyMarket[] = [
  {
    id: "active-addresses",
    title: "Active Addresses",
    description: "Will Base have 50,000+ unique active addresses today?",
    category: "Network Activity",
    yesLabel: "Yes, 50K+",
    noLabel: "No, <50K",
  },
  {
    id: "total-transactions",
    title: "Total Transactions",
    description: "Will Base process more than 2 million transactions today?",
    category: "Network Activity",
    yesLabel: "Yes, >2M",
    noLabel: "No, ≤2M",
  },
  {
    id: "avg-gas-price",
    title: "Average Gas Price",
    description: "Will the average gas price be 0.2 gwei or lower today?",
    category: "Network Economics",
    yesLabel: "Yes, ≤0.2 gwei",
    noLabel: "No, >0.2 gwei",
  },
  {
    id: "new-contracts",
    title: "New Contracts",
    description: "Will 200+ new contracts be deployed on Base today?",
    category: "Developer Activity",
    yesLabel: "Yes, 200+",
    noLabel: "No, <200",
  },
  {
    id: "block-count",
    title: "Block Production",
    description: "Will Base produce more than 43,000 blocks today?",
    category: "Network Activity",
    yesLabel: "Yes, >43K blocks",
    noLabel: "No, ≤43K blocks",
  },
  {
    id: "erc20-transfers",
    title: "ERC20 Transfers",
    description: "Will there be more than 1 million ERC20 token transfers today?",
    category: "Token Activity",
    yesLabel: "Yes, >1M",
    noLabel: "No, ≤1M",
  },
  {
    id: "tx-per-block",
    title: "Transaction Throughput",
    description: "Will the average transactions per block exceed 50 today?",
    category: "Network Performance",
    yesLabel: "Yes, >50 tx/block",
    noLabel: "No, ≤50 tx/block",
  },
  {
    id: "unique-contract-interactions",
    title: "Contract Interactions",
    description: "Will 10,000+ unique addresses interact with smart contracts today?",
    category: "Developer Activity",
    yesLabel: "Yes, 10K+",
    noLabel: "No, <10K",
  },
];
