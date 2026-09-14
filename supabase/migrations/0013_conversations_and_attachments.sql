-- Conversation memory for Forge (client-facing chat) and the Telegram bot,
-- so both can hold a real multi-turn conversation instead of one-shot
-- classification. Attachments are stored as jsonb arrays of
-- {url, mimeType, filename} -- the actual bytes live in the existing
-- public client-media bucket (see _shared/storage.ts's uploadClientMedia),
-- these tables just track what was said/sent and when.

create table if not exists public.forge_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_conversations_user_id_idx on public.forge_conversations (user_id, status);

alter table public.forge_conversations enable row level security;

create policy "Users can read their own forge conversations" on public.forge_conversations
  for select using (auth.uid() = user_id);
create policy "Users can create their own forge conversations" on public.forge_conversations
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own forge conversations" on public.forge_conversations
  for update using (auth.uid() = user_id);

create table if not exists public.forge_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.forge_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_messages_conversation_id_idx on public.forge_messages (conversation_id, created_at);

alter table public.forge_messages enable row level security;

create policy "Users can read their own forge messages" on public.forge_messages
  for select using (
    exists (
      select 1 from public.forge_conversations c
      where c.id = forge_messages.conversation_id and c.user_id = auth.uid()
    )
  );
create policy "Users can insert their own forge messages" on public.forge_messages
  for insert with check (
    exists (
      select 1 from public.forge_conversations c
      where c.id = forge_messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- The Telegram bot's conversation memory -- service-role only (no client SDK
-- ever touches this directly), keyed by chat_id since the bot itself is the
-- owner-only control channel, not per-app-user.
create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_messages_chat_id_idx on public.bot_messages (chat_id, created_at);

alter table public.bot_messages enable row level security;
-- No policies -- service role bypasses RLS; this just blocks any
-- accidental anon/authenticated access the same as other worker-only
-- tables in this project.
