-- Supports two ways a client picks who "stars" in their avatar video:
-- (1) a small owner-curated catalog pulled from HeyGen's own library
-- (browsed/added via Telegram /avatars, /voices, /addavatar, /addvoice),
-- or (2) a client's own custom avatar (instant -- HeyGen's "talking photo"
-- from an uploaded photo, no training wait) or cloned voice (async --
-- HeyGen trains it, hence status/provider_id starting null and a poller
-- filling them in). Custom creation is free but gated to clients who
-- already have wallet funds, as a lightweight anti-abuse check -- see
-- create-custom-avatar/create-custom-voice.

create table if not exists public.catalog_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('avatar', 'voice')),
  provider_id text not null,
  name text not null,
  gender text,
  language text,
  preview_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists catalog_options_kind_active_idx on public.catalog_options (kind, active, sort_order);

create table if not exists public.client_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('avatar', 'voice')),
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  provider_id text,
  preview_url text,
  consent_given boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_avatars_user_id_idx on public.client_avatars (user_id);

alter table public.client_avatars enable row level security;
drop policy if exists "Users can read their own avatars/voices" on public.client_avatars;
create policy "Users can read their own avatars/voices" on public.client_avatars
  for select using (auth.uid() = user_id);

alter table public.catalog_options enable row level security;
drop policy if exists "Anyone can read the active catalog" on public.catalog_options;
create policy "Anyone can read the active catalog" on public.catalog_options
  for select using (active = true);
