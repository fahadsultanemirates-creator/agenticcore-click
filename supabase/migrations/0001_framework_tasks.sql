-- Core task queue for the .click framework (Grok-designed schema,
-- kept unchanged from the original Supabase-agnostic design; only the
-- host changed from the earlier Replit plan to this Supabase project).
--
-- Dispatch priority: website-sourced tasks always jump ahead of
-- owner-sourced ones, regardless of age -- "ORDER BY source = 'owner'
-- ASC, created_at ASC" at query time. wallet_confirmed gates dispatch
-- for website tasks (set true once funds are present in the client's
-- wallet); owner tasks don't need it, they just queue behind.
-- public_id (e.g. "AC-CLICK-0001") is generated in code, not by a
-- Postgres sequence, matching .agency's manager_tasks convention:
-- count existing rows, add one, pad to 4 digits, retry on unique
-- violation for race safety.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  source text not null default 'website'
    check (source in ('website', 'owner')),
  type text not null
    check (type in ('website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit')),
  subtype text,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'needs_info', 'delivered', 'failed', 'cancelled')),
  version integer not null default 1,
  revisions_used integer not null default 0,
  wallet_confirmed boolean not null default false,
  user_id uuid,
  owner_channel_id text,
  payload jsonb not null default '{}'::jsonb,
  brand jsonb not null default '{}'::jsonb,
  preview_url text,
  parent_task_id uuid references public.tasks(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_dispatch_order_idx on public.tasks (source, created_at);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_user_id_idx on public.tasks (user_id);

-- Versioned, per-option deliverable files (image/video workers return
-- multiple options; option_index distinguishes them within a version).
create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  version integer not null default 1,
  option_index integer not null default 1,
  file_type text not null,
  storage_path text,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists task_files_task_id_idx on public.task_files (task_id);

-- Audit log: every state change / worker call against a task.
create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null,
  actor text not null default 'system',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_id_idx on public.task_events (task_id);
