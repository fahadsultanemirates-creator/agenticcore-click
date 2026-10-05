-- A paying client who ordered in Telegram is a paying client.
--
-- `source` was a two-value column, 'website' or 'owner', and the dispatch
-- rule was written as "website first". That was the same statement twice
-- while those were the only two values: website meant a client who paid,
-- owner meant a dogfood task. Adding a third value breaks the pun --
-- a Telegram order is a client who paid, but it is not 'website', so the
-- existing rule would sort it behind the owner's own test tasks.
--
-- So the column gains 'telegram', and the rule is restated as what it
-- always meant: owner tasks go last.

alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('website', 'owner', 'telegram'));

-- Same function as 0006, with the ordering expressed as "owner last"
-- rather than "website first".
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
    order by (source = 'owner'), created_at asc
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

revoke execute on function public.claim_next_task() from public, anon, authenticated;
