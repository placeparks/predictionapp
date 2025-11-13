-- Daily Base predictions tables and helpers
create extension if not exists pgcrypto;

create table if not exists base_daily_entries (
  id uuid primary key default gen_random_uuid(),
  session_id text not null, -- Changed from date to text for test mode (supports YYYY-MM-DD-HH-MM format)
  market_id text not null,
  user_address text not null,
  side_yes boolean not null,
  created_at timestamptz default now()
);

create unique index if not exists idx_base_daily_entries_unique
  on base_daily_entries(session_id, market_id, user_address);

create index if not exists idx_base_daily_entries_market
  on base_daily_entries(session_id, market_id, side_yes);

create or replace function normalize_base_daily_entry()
returns trigger as $$
begin
  new.user_address := lower(new.user_address);
  new.created_at := coalesce(new.created_at, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_base_daily_entries_normalize on base_daily_entries;
create trigger trg_base_daily_entries_normalize
before insert or update on base_daily_entries
for each row execute function normalize_base_daily_entry();

create table if not exists base_daily_outcomes (
  session_id text not null, -- Changed from date to text for test mode (supports YYYY-MM-DD-HH-MM format)
  market_id text not null,
  outcome_yes boolean not null,
  resolved_at timestamptz default now(),
  awarded boolean not null default false,
  awarded_at timestamptz,
  primary key (session_id, market_id)
);

create or replace function touch_base_daily_outcome()
returns trigger as $$
begin
  new.resolved_at := coalesce(new.resolved_at, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_base_daily_outcomes_touch on base_daily_outcomes;
create trigger trg_base_daily_outcomes_touch
before insert or update on base_daily_outcomes
for each row execute function touch_base_daily_outcome();

-- session tracker
create table if not exists base_daily_sessions (
  session_id text primary key, -- Changed from date to text for test mode (supports YYYY-MM-DD-HH-MM format)
  phase text not null check (phase in ('open','locked','settled','break')),
  open_at timestamptz not null,
  lock_at timestamptz not null,
  resolve_at timestamptz not null,
  anchor_time timestamptz,
  anchor_block bigint,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function touch_base_daily_session()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_base_daily_sessions_touch on base_daily_sessions;
create trigger trg_base_daily_sessions_touch
before insert or update on base_daily_sessions
for each row execute function touch_base_daily_session();

-- metrics cache for audit and automation
create table if not exists base_daily_metrics_cache (
  session_id text not null, -- Changed from date to text for test mode (supports YYYY-MM-DD-HH-MM format)
  market_id text not null,
  phase text not null check (phase in ('baseline','pre','final')),
  source text not null,
  payload jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (session_id, market_id, phase, source)
);

create index if not exists idx_base_daily_metrics_session
  on base_daily_metrics_cache(session_id, market_id, phase);

-- settlement log
create table if not exists base_daily_settlements (
  id bigserial primary key,
  session_id text not null, -- Changed from date to text for test mode (supports YYYY-MM-DD-HH-MM format)
  market_id text not null,
  awarded_count integer not null default 0,
  merkle_root bytea,
  ipfs_cid text,
  created_at timestamptz not null default now(),
  unique (session_id, market_id)
);

create index if not exists idx_base_daily_settlements_session
  on base_daily_settlements(session_id);

create index if not exists idx_base_daily_entries_session
  on base_daily_entries(session_id, market_id, user_address);

create index if not exists idx_base_daily_outcomes_session
  on base_daily_outcomes(session_id, market_id, awarded);

create or replace view v_base_daily_winners as
select
  e.session_id,
  e.market_id,
  e.user_address,
  sum(1)::int as win_points
from base_daily_entries e
join base_daily_outcomes o
  on o.session_id = e.session_id
 and o.market_id = e.market_id
where (o.outcome_yes is true  and e.side_yes is true)
   or (o.outcome_yes is false and e.side_yes is false)
group by e.session_id, e.market_id, e.user_address;

create or replace function award_base_daily_market(p_session text, p_market text) -- Changed from date to text for test mode
returns jsonb
security definer
set search_path = public
language plpgsql
as $$
declare
  already_awarded boolean;
  awarded integer := 0;
  winner record;
  lock_key bigint;
begin
  lock_key := hashtextextended('base_daily_award', 0) # (hashtext(p_session) # hashtext(p_market));
  perform pg_advisory_xact_lock(lock_key);

  select exists(
    select 1
    from base_daily_settlements
    where session_id = p_session
      and market_id = p_market
  )
  into already_awarded;

  if already_awarded then
    return jsonb_build_object('ok', true, 'already_awarded', true);
  end if;

  if not exists (
    select 1
    from base_daily_outcomes
    where session_id = p_session
      and market_id = p_market
      and outcome_yes is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'outcome_missing');
  end if;

  for winner in
    select user_address, win_points
    from v_base_daily_winners
    where session_id = p_session
      and market_id = p_market
  loop
    perform grant_points(winner.user_address, winner.win_points);
    awarded := awarded + 1;
  end loop;

  insert into base_daily_settlements(session_id, market_id, awarded_count)
  values (p_session, p_market, awarded);

  update base_daily_outcomes
     set awarded = true,
         awarded_at = now()
   where session_id = p_session
     and market_id = p_market;

  return jsonb_build_object('ok', true, 'awarded_count', awarded);
end;
$$;

