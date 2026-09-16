-- Let a client see their own work -- and only their own.
--
-- Two things were true before this migration:
--
--   1. The dashboard showed sample rows, because a logged-in client had no
--      supported way to read the tasks they had actually paid for. Everything
--      real was delivered through Telegram to the owner.
--   2. Row level security was OFF on tasks, task_files and task_events, while
--      the anon and authenticated roles held full SELECT/INSERT/UPDATE/DELETE
--      on all three. The anon key ships inside the browser bundle, so in
--      practice anyone at all could read every client's brief and deliverable
--      URLs, and could delete them.
--
-- The second is why the first has to be fixed carefully rather than by simply
-- pointing the dashboard at the table. Turning these into client-readable
-- tables means turning RLS on first.
--
-- Writes stay server-side. Every task is created, advanced and delivered by an
-- edge function using the service role, which bypasses RLS entirely -- so no
-- write policy is granted here, and the table-level write grants are revoked
-- so that "clients cannot write" is stated rather than merely implied by the
-- absence of a policy.

alter table public.tasks enable row level security;
alter table public.task_files enable row level security;
alter table public.task_events enable row level security;

revoke insert, update, delete, truncate on public.tasks from anon, authenticated;
revoke insert, update, delete, truncate on public.task_files from anon, authenticated;
revoke insert, update, delete, truncate on public.task_events from anon, authenticated;

-- Owner tasks raised from Telegram have no user_id, so they match no policy
-- and stay invisible to every client. That is the intended result.
drop policy if exists "Clients read their own tasks" on public.tasks;
create policy "Clients read their own tasks" on public.tasks
  for select using (auth.uid() = user_id);

drop policy if exists "Clients read their own task files" on public.task_files;
create policy "Clients read their own task files" on public.task_files
  for select using (
    exists (select 1 from public.tasks t where t.id = task_files.task_id and t.user_id = auth.uid())
  );

-- The event feed is the client's progress trail ("queued", "generating",
-- "delivered"), matching the task_files policy.
drop policy if exists "Clients read their own task events" on public.task_events;
create policy "Clients read their own task events" on public.task_events
  for select using (
    exists (select 1 from public.tasks t where t.id = task_events.task_id and t.user_id = auth.uid())
  );

-- When the client last opened this order. A delivered task they have not
-- opened is what the dashboard badges as new, so "your work is ready" is
-- visible in the product itself rather than only in the owner's Telegram.
alter table public.tasks add column if not exists client_seen_at timestamptz;

create index if not exists tasks_user_created_idx on public.tasks (user_id, created_at desc);

-- Lets a client mark their own order as seen without granting UPDATE on the
-- table (which would let them edit a brief, a price, or a revision count).
-- SECURITY DEFINER runs as the owner; the where-clause pins it to the caller's
-- own rows, so it can only ever touch one column of one client's task.
create or replace function public.mark_task_seen(p_task_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tasks
     set client_seen_at = now()
   where id = p_task_id
     and user_id = auth.uid();
$$;

revoke all on function public.mark_task_seen(uuid) from public;
grant execute on function public.mark_task_seen(uuid) to authenticated;
