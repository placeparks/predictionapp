create table if not exists wallet_stats (
  address text primary key,
  chain text not null default 'base',
  tx_count int not null default 0,
  unique_peers int not null default 0,
  erc20_count int not null default 0,
  erc20_usd numeric not null default 0,
  nft_collections int not null default 0,
  nft_count int not null default 0,
  has_basename boolean not null default false,
  last_indexed_at timestamptz not null default now()
);

create table if not exists eligibility (
  address text primary key,
  tier int not null default 0,
  next_tier int not null default 1,
  last_computed_at timestamptz not null default now()
);

create index if not exists wallet_stats_last_idx on wallet_stats (last_indexed_at desc);
