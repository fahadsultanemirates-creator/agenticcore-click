-- Transactional email: welcome, order placed, order delivered, top-up.
--
-- Every email is a row before it is a request. Three reasons it is an
-- outbox rather than a fetch() at each call site:
--
-- 1. The call sites are the ends of flows that have already taken money or
--    produced a deliverable. An order must not fail, or worse half-fail,
--    because a mail API returned 500. An insert into this table is part of
--    the same transaction as the thing it describes, and sending is
--    somebody else's problem a minute later.
-- 2. "The client says they never got it" is otherwise unanswerable. Here
--    it is one select.
-- 3. A send that fails is retried without anyone writing retry logic at
--    four different call sites.
--
-- The row stores the FACTS (kind + payload), not rendered HTML. A fix to
-- the wording in _shared/emailTemplates.ts therefore also fixes mail that
-- has not gone out yet, and the table does not grow by 4KB per email.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  -- Matches the template functions in _shared/emailTemplates.ts. Checked
  -- here so a typo at a call site fails at the insert, where the stack
  -- trace points at the caller, rather than silently never sending.
  kind text not null check (kind in ('welcome', 'order_placed', 'order_delivered', 'topup')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- The sweep's only query: pending rows, oldest first.
create index if not exists email_outbox_pending_idx
  on public.email_outbox (created_at)
  where status = 'pending';

-- Nobody reads their own email log; this table is worker-only, like the
-- rest of the pipeline. RLS on with no policy means the anon and
-- authenticated roles see nothing, while the service role bypasses it.
alter table public.email_outbox enable row level security;

-- One welcome per account, ever. A retried signup, a trigger that fires
-- twice during a migration, a restored backup -- any of them would
-- otherwise send a second "your account is ready" to someone who has been
-- a customer for a month.
create unique index if not exists email_outbox_one_welcome_idx
  on public.email_outbox (to_email)
  where kind = 'welcome';

-- Claims a batch atomically, the same way claim_next_task does, so two
-- sweeps overlapping (the cron racing a nudge from a worker) can never
-- send the same email twice. The attempt is counted at claim time, not at
-- failure time: a send that crashes the function after Brevo accepted it
-- must not come back around and send again.
create or replace function public.claim_pending_emails(p_limit integer default 20)
returns setof public.email_outbox
language plpgsql
as $$
begin
  return query
  with claimed as (
    select id from public.email_outbox
      where status = 'pending' and attempts < 5
      order by created_at asc
      limit p_limit
      for update skip locked
  )
  update public.email_outbox o
     set attempts = o.attempts + 1
    from claimed
   where o.id = claimed.id
  returning o.*;
end;
$$;

-- Workers run as the service role, which bypasses these grants, but the
-- anon and authenticated roles must not be able to queue mail to an
-- arbitrary address.
revoke execute on function public.claim_pending_emails(integer) from public, anon, authenticated;

-- A row that has burned all five attempts is dead; say so, so it stops
-- being counted as "pending but quiet" and shows up in a status query.
create or replace function public.expire_failed_emails()
returns integer
language sql
as $$
  with dead as (
    update public.email_outbox
       set status = 'failed'
     where status = 'pending' and attempts >= 5
    returning 1
  )
  select count(*)::integer from dead;
$$;

revoke execute on function public.expire_failed_emails() from public, anon, authenticated;

-- The welcome email, queued the moment the account exists.
--
-- A trigger rather than a call from the signup page: the browser can close,
-- lose its network, or never run the follow-up at all, and an account that
-- exists with no welcome is invisible -- nothing fails, the client simply
-- never hears from us. The row is written in the same transaction that
-- creates the user, so if the account exists, the email is queued.
create or replace function public.queue_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email <> '' then
    insert into public.email_outbox (to_email, kind)
    values (new.email, 'welcome')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_queue_welcome on auth.users;
create trigger on_auth_user_created_queue_welcome
  after insert on auth.users
  for each row execute function public.queue_welcome_email();

-- Every minute, and only when there is something to send: net.http_post is
-- not free, and an idle project should not be making 1,440 pointless
-- requests a day.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-outbox-sweep') then
    perform cron.unschedule('email-outbox-sweep');
  end if;
end $$;

select cron.schedule(
  'email-outbox-sweep',
  '* * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/send-email',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb,
    body := '{}'::jsonb
  )
  where exists (select 1 from public.email_outbox where status = 'pending' and attempts < 5);
  $sql$
);
