-- Opening an account from Telegram.
--
-- Until now this bot was owner-only: anyone else got "this bot is for
-- internal use only". A client can now create a real account from a chat,
-- with nothing but a Telegram account and an email address.
--
-- The shape of it, and why:
--
-- * Identity is Telegram's verified user id, never anything in the message
--   text. A chat can say "I am account 1007" all it likes; it changes
--   nothing. One Telegram account maps to at most one of ours, enforced by
--   a unique index rather than by the code remembering to check.
--
-- * The account is real from the first message -- the client can order
--   immediately. What they do not have yet is a password, because they
--   never visited the website to choose one. Supabase lets a user exist
--   without one, which is exactly this state.
--
-- * They get a one-time code, shown in the chat, good for 30 days. On the
--   website they enter their email and that code and set a password. The
--   code is shown in Telegram rather than emailed on purpose: the bot
--   already knows who it is talking to, so emailing it adds a spam folder
--   and a provider outage between a client and their own account, and
--   proves nothing the chat has not already proved.
--
-- * No password within 30 days and the account pauses: nothing is deleted,
--   nothing is hidden, new orders simply stop until a password is set.
--   Reminders go out on day 23 and day 29. An account with no password and
--   no deadline is an account that can never be recovered if the client
--   loses their Telegram.

create table if not exists public.telegram_accounts (
  user_id uuid primary key,
  -- Telegram's own id for the person, from the signed webhook payload.
  tg_user_id bigint not null unique,
  chat_id bigint not null,
  tg_username text,
  -- True when we created the auth user ourselves, from a chat. A client
  -- who signed up on the website and later linked Telegram is not on the
  -- 30-day clock -- they already have a password.
  created_in_telegram boolean not null default false,
  password_set_at timestamptz,
  -- Null for a website account that linked afterwards: no deadline to miss.
  grace_expires_at timestamptz,
  paused_at timestamptz,
  linked_at timestamptz not null default now()
);

-- The sweep's query: accounts still without a password.
create index if not exists telegram_accounts_grace_idx
  on public.telegram_accounts (grace_expires_at)
  where password_set_at is null and paused_at is null;

alter table public.telegram_accounts enable row level security;

-- One-time sign-in codes, stored as SHA-256 only. The plaintext exists in
-- the Telegram message and in the client's head, nowhere else -- a dump of
-- this table hands an attacker nothing they can type in.
create table if not exists public.tg_signin_codes (
  code_hash text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists tg_signin_codes_user_idx
  on public.tg_signin_codes (user_id, created_at desc);

alter table public.tg_signin_codes enable row level security;

-- Telegram retries an update it thinks failed, and our handler can take
-- long enough (a transcription, a model call) for that to happen while the
-- first one is still running. Without this, one "yes, create my account"
-- becomes two accounts.
create table if not exists public.tg_seen_updates (
  update_id bigint primary key,
  seen_at timestamptz not null default now()
);

alter table public.tg_seen_updates enable row level security;

-- What the bot is in the middle of asking a given chat. Signup is three
-- questions, and a stateless webhook has nowhere else to remember them.
create table if not exists public.tg_sessions (
  chat_id bigint primary key,
  tg_user_id bigint,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tg_sessions enable row level security;

-- Reminders and one-off notices that must go out exactly once. Keyed by
-- what it is and what it is about, so re-running a sweep is free.
create table if not exists public.tg_notices (
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref)
);

alter table public.tg_notices enable row level security;

-- Claims an update id, returning true only for the first caller. The
-- insert is the lock: a duplicate delivery loses the primary key race and
-- is told to do nothing.
create or replace function public.claim_telegram_update(p_update_id bigint)
returns boolean
language plpgsql
as $$
begin
  insert into public.tg_seen_updates (update_id) values (p_update_id);
  return true;
exception when unique_violation then
  return false;
end;
$$;

revoke execute on function public.claim_telegram_update(bigint) from public, anon, authenticated;

-- Redeems a code: marks it used and records the password, in one
-- statement, so two browsers submitting the same code cannot both win.
-- Returns the user id, or null when the code is unusable for any reason.
create or replace function public.redeem_signin_code(p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.tg_signin_codes
     set used_at = now()
   where code_hash = p_code_hash
     and used_at is null
     and expires_at > now()
  returning user_id into v_user_id;

  if v_user_id is null then
    return null;
  end if;

  -- Setting a password stops the clock and un-pauses, in the same
  -- transaction as spending the code. Separately, one of the two could
  -- land without the other and leave an account paused with a spent code.
  update public.telegram_accounts
     set password_set_at = now(),
         paused_at = null
   where user_id = v_user_id;

  return v_user_id;
end;
$$;

revoke all on function public.redeem_signin_code(text) from public, anon, authenticated;

-- Pauses accounts whose 30 days ran out. Returns the rows it paused so the
-- caller can tell each one in Telegram.
create or replace function public.pause_expired_telegram_accounts()
returns table(user_id uuid, chat_id bigint)
language sql
security definer
set search_path = public
as $$
  update public.telegram_accounts
     set paused_at = now()
   where password_set_at is null
     and paused_at is null
     and grace_expires_at is not null
     and grace_expires_at <= now()
  returning telegram_accounts.user_id, telegram_accounts.chat_id;
$$;

revoke all on function public.pause_expired_telegram_accounts() from public, anon, authenticated;

-- Is this account allowed to place new orders? Used by the submit paths,
-- which must refuse a paused account rather than take its money.
-- Everything else -- reading, downloading what they already paid for --
-- stays open: pausing is a prompt to set a password, not a lockout.
create or replace function public.telegram_account_paused(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select paused_at is not null from public.telegram_accounts where user_id = p_user_id),
    false
  );
$$;

-- Every minute is wrong for a daily deadline, and the bot has to send the
-- day-23 and day-29 reminders anyway, so one function does both once an
-- hour. 17 past, not on the hour, to stay out of the way of the other
-- sweeps.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'telegram-account-sweep') then
    perform cron.unschedule('telegram-account-sweep');
  end if;
end $$;

select cron.schedule(
  'telegram-account-sweep',
  '17 * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/telegram-sweep',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb,
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.telegram_accounts
     where password_set_at is null and paused_at is null
  );
  $sql$
);

-- Old update ids are only useful for as long as Telegram might retry one.
-- A day is generous; the table would otherwise grow forever.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'tg-seen-updates-prune') then
    perform cron.unschedule('tg-seen-updates-prune');
  end if;
end $$;

select cron.schedule(
  'tg-seen-updates-prune',
  '41 3 * * *',
  $sql$ delete from public.tg_seen_updates where seen_at < now() - interval '1 day'; $sql$
);
