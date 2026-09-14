-- Dispatcher support: atomic task claiming, a slot for a worker's async
-- provider job id (HeyGen video jobs), and the public storage bucket
-- workers upload deliverables into.

alter table public.tasks add column if not exists provider_job_id text;
create index if not exists tasks_provider_job_id_idx on public.tasks (provider_job_id);

-- Atomically claims the single highest-priority queued task so concurrent
-- dispatcher invocations (an event-triggered call racing the cron safety
-- net) never grab the same row twice. Priority: website-sourced tasks
-- always ahead of owner-sourced ones regardless of age, then oldest first.
create or replace function public.claim_next_task()
returns public.tasks
language plpgsql
as $$
declare
  v_task public.tasks;
begin
  select * into v_task
    from public.tasks
    where status = 'queued' and wallet_confirmed = true
    order by (source <> 'website'), created_at asc
    limit 1
    for update skip locked;

  if v_task.id is not null then
    update public.tasks
      set status = 'in_progress', updated_at = now()
      where id = v_task.id
      returning * into v_task;
  end if;

  return v_task;
end;
$$;

insert into storage.buckets (id, name, public)
values ('deliverables', 'deliverables', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to deliverables" on storage.objects;
create policy "Public read access to deliverables"
  on storage.objects for select
  using (bucket_id = 'deliverables');
