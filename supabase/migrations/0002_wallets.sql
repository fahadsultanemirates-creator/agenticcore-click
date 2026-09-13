-- Wallet balances funded via PayRam top-ups. Not a credit system: the
-- dollar amount credited equals the amount paid, no bonus. tier records
-- which wallet package (wallet-10/30/100/200, see src/data/packages.ts)
-- the balance came from, since that tier is what later determines the
-- first-time vs. routine discount percentage applied to a service's own
-- price -- that discount calculation happens in dispatch code, not here.

create table if not exists public.wallets (
  user_id uuid primary key,
  balance_usd numeric(10, 2) not null default 0,
  tier text,
  updated_at timestamptz not null default now()
);

-- One row per PayRam payment attempt for a wallet top-up. invoice_id is
-- the "click-<uuid>" value sent to PayRam and echoed back on its
-- webhook (relayed via .agency, see payram-webhook/index.ts).
create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  invoice_id text not null unique,
  tier text not null,
  amount_usd numeric(10, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists wallet_topups_user_id_idx on public.wallet_topups (user_id);

-- Atomic credit -- a plain read-then-write from the webhook would lose
-- an increment if two confirmations for the same user landed at once.
create or replace function public.increment_wallet_balance(
  p_user_id uuid,
  p_amount numeric,
  p_tier text
) returns void
language sql
as $$
  insert into public.wallets (user_id, balance_usd, tier, updated_at)
  values (p_user_id, p_amount, p_tier, now())
  on conflict (user_id) do update
    set balance_usd = public.wallets.balance_usd + excluded.balance_usd,
        tier = excluded.tier,
        updated_at = now();
$$;
