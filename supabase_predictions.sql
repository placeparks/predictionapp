-- Enable required extensions
create extension if not exists pgcrypto;

-- Markets metadata mirrored from Kalshi (optional, for frontend caching)
create table if not exists markets (
  market_id text primary key,         -- keccak256(ticker) or ticker itself
  ticker text not null,
  title text,
  subtitle text,
  category text,
  status text,
  close_ts bigint,
  open_interest numeric,
  volume numeric,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_markets_status on markets(status);

-- Periods for vault accounting (Flow 2)
create table if not exists periods (
  period_id bigint primary key,
  vault_id bigint not null,
  status text default 'open',     -- open | settled | closed
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now()
);

-- User predictions (EIP-712 signed off-chain records)
create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  user_address text not null,
  vault_id bigint not null,
  period_id bigint not null references periods(period_id) on delete cascade,
  market_id text not null,
  side_yes boolean not null,
  stake_points numeric not null,
  nonce numeric not null,
  deadline bigint not null,
  signature text not null,
  created_at timestamptz default now()
);
create unique index if not exists uq_predictions_user_nonce on predictions(user_address, nonce);
create index if not exists idx_predictions_market_period on predictions(market_id, period_id);
create index if not exists idx_predictions_user on predictions(user_address);

-- Outcomes resolved from Kalshi API via oracle worker
create table if not exists outcomes (
  market_id text primary key,
  resolved boolean default false,
  side_yes boolean,
  settlement_ts timestamptz,
  source text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Distribution records once settlement is applied
create table if not exists distributions (
  id uuid primary key default gen_random_uuid(),
  period_id bigint not null references periods(period_id) on delete cascade,
  user_address text not null,
  amount_usdc numeric not null,
  tx_hash text,
  created_at timestamptz default now()
);
create index if not exists idx_distributions_user on distributions(user_address);
create index if not exists idx_distributions_period on distributions(period_id);

