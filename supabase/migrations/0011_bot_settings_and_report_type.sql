-- Tiny key/value store for the Telegram bot's own state that isn't
-- per-task -- currently just which language to default to for
-- owner-initiated pushes (daily summary, worker notifyOwner pings) where
-- there's no incoming message to detect language from. Kept in sync with
-- whichever language the owner most recently wrote/spoke in.
create table if not exists public.bot_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.bot_settings (key, value)
values ('owner_language', 'en')
on conflict (key) do nothing;

-- Owner-only "business report" task: given a URL, screenshot + analyze
-- the site and produce a flaws/improvements/marketing-plan deck. Not in
-- the public services list -- created only via the Telegram bot.
alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check
  check (type in ('website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit', 'business-report'));
