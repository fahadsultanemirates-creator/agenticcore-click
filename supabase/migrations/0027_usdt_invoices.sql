-- Paying by USDT on BNB Smart Chain.
--
-- One receiving address, and every open invoice is paid with a slightly
-- different amount, so the amount identifies the invoice. See
-- _shared/usdtAmount.ts for why that is exact rather than tolerant.
--
-- Two guards live here rather than in application code, because both are
-- the kind that only fail under concurrency -- which is to say, in front of
-- a real client and never in a test.

create table if not exists public.usdt_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  -- What the wallet is credited with when this is paid. NOT the amount
  -- sent: that carries the nonce, and crediting it would hand back the
  -- fraction of a cent used to identify the payment.
  base_usd numeric(10, 2) not null,
  tier text not null,

  -- The exact decimal string the client must send, e.g. "20.000007".
  -- Text, not numeric: this is compared byte-for-byte against what the
  -- chain reports, and a numeric column would round it on the way in.
  amount text not null,
  nonce integer not null check (nonce between 1 and 9999),

  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'cancelled')),

  -- GUARD 1. The transaction that paid this. Unique across the whole
  -- table, so one payment can never be credited twice -- not by a retry,
  -- not by two sweeps overlapping, not by a poll racing the cron.
  tx_hash text unique,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);

-- GUARD 2. Two OPEN invoices must never share an amount, or a payment
-- arriving for it cannot be attributed to one client. The nonce search in
-- application code is advisory -- it reads, then writes, and two requests
-- can read the same gap. This is what actually enforces it: the second
-- insert fails and the caller picks another nonce.
--
-- Partial, so a paid invoice does not block the amount forever.
create unique index if not exists usdt_invoices_open_amount_idx
  on public.usdt_invoices (amount)
  where status = 'pending';

create index if not exists usdt_invoices_user_idx
  on public.usdt_invoices (user_id, created_at desc);

create index if not exists usdt_invoices_pending_idx
  on public.usdt_invoices (expires_at)
  where status = 'pending';

alter table public.usdt_invoices enable row level security;

-- Clients read their own invoices and write none of them: the amount, the
-- status and the credit are all decided server-side.
revoke insert, update, delete, truncate on public.usdt_invoices from anon, authenticated;

drop policy if exists "Users read their own usdt invoices" on public.usdt_invoices;
create policy "Users read their own usdt invoices" on public.usdt_invoices
  for select using (auth.uid() = user_id);

-- Crediting a paid invoice, atomically.
--
-- Marking the invoice and crediting the wallet have to happen together or
-- not at all. Done as two statements from an edge function, a crash between
-- them leaves either money credited against an unpaid invoice or a paid
-- invoice whose money never arrived -- and the second is the one a client
-- reports.
--
-- Forward-only, like claim_next_task: the UPDATE is conditional on the row
-- still being pending, so whoever gets there first wins and everybody else
-- is told false rather than crediting again.
create or replace function public.credit_usdt_invoice(
  p_invoice_id uuid,
  p_tx_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.usdt_invoices%rowtype;
begin
  update public.usdt_invoices
     set status = 'paid',
         tx_hash = p_tx_hash,
         paid_at = now()
   where id = p_invoice_id
     and status = 'pending'
  returning * into v_invoice;

  if not found then
    -- Already paid, expired, cancelled, or another caller won the race.
    return false;
  end if;

  perform public.increment_wallet_balance(v_invoice.user_id, v_invoice.base_usd, v_invoice.tier);
  return true;
exception
  when unique_violation then
    -- This transaction hash already credited some other invoice. That is
    -- the duplicate-credit case the unique constraint exists to stop, so
    -- it is reported rather than swallowed.
    return false;
end $$;

-- Only the service role calls this. PUBLIC gets EXECUTE on a new function
-- by default and both client roles inherit it from there, so revoking from
-- the named roles alone would change nothing -- the same trap migration
-- 0019 documents.
revoke all on function public.credit_usdt_invoice(uuid, text) from public, anon, authenticated;

-- Invoices nobody paid stop being pending, which frees their amount for
-- reuse and stops the sweep checking them forever.
create or replace function public.expire_usdt_invoices() returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.usdt_invoices
       set status = 'expired'
     where status = 'pending'
       and expires_at < now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.expire_usdt_invoices() from public, anon, authenticated;

-- The sweep.
--
-- The billing page polls its own invoice while somebody is watching it,
-- but a client who sends the USDT and closes the tab must still be
-- credited. Every minute rather than every two: the whole selling point
-- against PayRam is that confirmation takes seconds, and a two-minute
-- sweep would make a 45-second confirmation feel like three minutes.
--
-- Auth: the anon key, same reasoning as 0007_cron.sql -- usdt-check runs
-- everything through its own service-role client regardless of caller, so
-- the caller's JWT only has to pass the platform's verify_jwt gate. A body
-- with no invoiceId is what puts it in sweep mode.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'usdt-payment-sweep') then
    perform cron.unschedule('usdt-payment-sweep');
  end if;
end $$;

select cron.schedule(
  'usdt-payment-sweep',
  '* * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/usdt-check',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb,
    body := '{}'::jsonb
  )
  where exists (select 1 from public.usdt_invoices where status = 'pending');
  $sql$
);
