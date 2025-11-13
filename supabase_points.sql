-- BET tokens balances table (rewards system)
-- Note: Table name kept as 'points_balances' for backward compatibility
-- The 'points' column stores BET tokens
create table if not exists points_balances (
  user_address text primary key,
  points numeric not null default 0, -- Stores BET tokens
  updated_at timestamptz default now()
);

-- Ensure lowercased addresses
create or replace function normalize_points_address()
returns trigger as $$
begin
  new.user_address := lower(new.user_address);
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_points_normalize on points_balances;
create trigger trg_points_normalize before insert or update on points_balances
for each row execute function normalize_points_address();

-- Atomically add BET tokens (purchase or admin grant)
create or replace function grant_points(p_user text, p_amount numeric)
returns void as $$
begin
  insert into points_balances(user_address, points)
  values (lower(p_user), greatest(p_amount, 0))
  on conflict (user_address) do update set points = points_balances.points + greatest(p_amount, 0), updated_at = now();
end;
$$ language plpgsql;

-- Atomically spend BET tokens, returns true if success
create or replace function spend_points(p_user text, p_amount numeric)
returns boolean as $$
declare ok integer;
begin
  update points_balances
  set points = points - p_amount, updated_at = now()
  where user_address = lower(p_user) and points >= p_amount;
  get diagnostics ok = row_count;
  return ok > 0;
end;
$$ language plpgsql;

