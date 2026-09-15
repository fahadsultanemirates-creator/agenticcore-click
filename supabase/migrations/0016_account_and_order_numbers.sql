-- Account numbers and per-account order numbers.
--
-- Until now every task carried one global sequential id (AC-CLICK-0007), which
-- says nothing about whose it is or how many things that client has ordered.
-- That is enough to name a task and not enough to reason about one: "revise my
-- letterhead" needs to know which account is asking, which of their orders is
-- the letterhead, and whether that product has any revisions left.
--
-- Memory alone can't supply that. A conversation can recall what was said; it
-- cannot enforce that a website gets two revisions and a logo gets none. So
-- identity becomes structure: an account has a number, each order within it has
-- a number, and each order records the product it is and the revisions it is
-- entitled to.
--
-- A client task's public id is now AC-<account>-<order>, e.g. AC-1007-03 --
-- readable as "the third thing account 1007 ordered". Owner/dogfood tasks keep
-- the old AC-CLICK-#### form; they are internal and belong to no client.

create sequence if not exists client_account_no_seq start 1001;

create table if not exists public.client_accounts (
  user_id uuid primary key,
  account_no integer not null unique default nextval('client_account_no_seq'),
  -- Held here rather than counted from tasks, so two simultaneous orders can
  -- never be handed the same number.
  next_order_no integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.client_accounts enable row level security;

drop policy if exists "Users can read their own account" on public.client_accounts;
create policy "Users can read their own account" on public.client_accounts
  for select using (auth.uid() = user_id);

-- What a task now knows about itself, beyond its brief.
alter table public.tasks add column if not exists account_no integer;
alter table public.tasks add column if not exists order_no integer;
alter table public.tasks add column if not exists sku integer;
-- Copied from the catalog at creation time rather than read live, so changing
-- a product's allowance later never retroactively alters what an existing
-- client was already sold.
alter table public.tasks add column if not exists revisions_allowed integer;

create index if not exists tasks_account_no_idx on public.tasks (account_no, order_no);
create index if not exists tasks_sku_idx on public.tasks (sku);

-- Allocates (and creates on first use) an account number, then takes the next
-- order number for it. The UPDATE ... RETURNING locks the account row, so
-- concurrent submissions queue rather than collide.
create or replace function public.allocate_order(p_user_id uuid)
returns table(account_no integer, order_no integer)
language plpgsql
as $$
declare
  v_account integer;
  v_order integer;
begin
  insert into public.client_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.client_accounts c
    set next_order_no = c.next_order_no + 1
    where c.user_id = p_user_id
    returning c.account_no, c.next_order_no - 1
    into v_account, v_order;

  account_no := v_account;
  order_no := v_order;
  return next;
end;
$$;
