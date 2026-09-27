-- An outside worker the manager can hand a task to.
--
-- Until now every product was built by a function in this repo. Grok Bot is
-- the first worker we do not run: it lives in somebody else's process, wakes
-- on a webhook, and hands finished files back. That changes three things
-- structurally, and this migration is those three things.
--
-- 1. WHICH tasks may go outside. Never inferred, always recorded: a per-SKU
--    route the owner sets deliberately, plus a per-task override. A product
--    with no route keeps going to the built-in worker exactly as before, so
--    installing this changes nothing until somebody says /assign.
--
-- 2. WHAT state an outside hand-off is in. A built-in worker either returns
--    or throws inside one invocation. An external agent might accept and go
--    quiet, or never accept at all, so the hand-off itself becomes a row
--    with a deadline rather than a function call.
--
-- 3. WHERE its files land before they are trusted. Not in `deliverables` --
--    that bucket is public-read and a client's dashboard reads straight from
--    it, so a half-uploaded file there is a half-finished deliverable shown
--    to a paying client. Staging is private and nothing reads it but us.

-- ---------------------------------------------------------------------
-- 1. Routing
-- ---------------------------------------------------------------------

-- A single task can be pointed at an agent regardless of its product, which
-- is how a one-off gets tried without committing a whole SKU to it.
alter table public.tasks add column if not exists assigned_agent text;

create table if not exists public.agent_routes (
  sku integer primary key,
  agent text not null,
  -- Who set it, so an unexpected route can be traced to a decision.
  set_by text,
  created_at timestamptz not null default now()
);

comment on table public.agent_routes is
  'Products an external agent handles instead of the built-in worker. Empty means everything stays in-house.';

-- ---------------------------------------------------------------------
-- 2. The hand-off itself
-- ---------------------------------------------------------------------

-- status:
--   offered   notice sent, nobody has picked it up yet
--   accepted  the agent said it is working on it
--   submitted the agent says it is done; we are validating
--   delivered promoted to the client and closed
--   released  the agent gave it back
--   failed    the agent reported it could not do it
--   expired   nobody accepted before the deadline
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent text not null,
  status text not null default 'offered',
  -- The agent authenticates every callback with this, so it is per job and
  -- never reused. A leaked token can only touch the one task it belongs to.
  token text not null unique,
  -- Not accepted by this time and the task goes back to a built-in worker.
  accept_deadline timestamptz not null,
  accepted_at timestamptz,
  submitted_at timestamptz,
  closed_at timestamptz,
  -- Why it ended, in the agent's own words, for the owner to read.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_jobs_task_idx on public.agent_jobs(task_id);
-- The sweep asks exactly one question every minute: which offered jobs are
-- past their deadline? This is the index that makes that free.
create index if not exists agent_jobs_open_idx on public.agent_jobs(status, accept_deadline)
  where status in ('offered', 'accepted');

create table if not exists public.agent_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.agent_jobs(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_job_events_job_idx on public.agent_job_events(job_id, created_at);

-- Files the agent has uploaded but that nobody has accepted yet. Kept apart
-- from task_files for the same reason staging is kept apart from
-- deliverables: a client's dashboard must never show work in progress.
create table if not exists public.agent_job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.agent_jobs(id) on delete cascade,
  storage_path text not null,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists agent_job_files_job_idx on public.agent_job_files(job_id);

-- ---------------------------------------------------------------------
-- 3. Nothing here is client-readable
-- ---------------------------------------------------------------------
--
-- RLS on with no policies at all: service_role bypasses RLS, everyone else
-- gets nothing. That is the correct answer for all four tables -- a callback
-- token in a row anyone could read would defeat the point of having one.

alter table public.agent_routes enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.agent_job_events enable row level security;
alter table public.agent_job_files enable row level security;

revoke all on public.agent_routes from anon, authenticated;
revoke all on public.agent_jobs from anon, authenticated;
revoke all on public.agent_job_events from anon, authenticated;
revoke all on public.agent_job_files from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Private staging bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('agent-staging', 'agent-staging', false)
on conflict (id) do update set public = false;
