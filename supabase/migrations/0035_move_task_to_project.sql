-- Moving an order into a different project.
--
-- An RPC rather than an UPDATE policy on tasks. A policy broad enough to
-- let a client set project_id is broad enough to let them set status,
-- payload, sku or revisions_allowed -- PostgREST does not restrict which
-- columns an UPDATE touches, only which rows. This function changes
-- exactly one column, and only when both the task and the destination
-- project belong to the caller.
--
-- Needed because the backfill guesses: it gave every old order its own
-- project named from the brief, so the five logos landed under "Client
-- wants a logo created." rather than under the business they are for.
-- Guessing is right; being unable to correct the guess is not.

create or replace function public.move_task_to_project(p_task_id uuid, p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_moved integer;
begin
  if v_user is null then
    return false;
  end if;

  -- The destination must be theirs. A null destination is allowed and
  -- means "unfile this", which costs nothing and avoids a special case.
  if p_project_id is not null
     and not exists (select 1 from public.projects where id = p_project_id and user_id = v_user) then
    return false;
  end if;

  update public.tasks
  set project_id = p_project_id
  where id = p_task_id and user_id = v_user;

  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    return false;
  end if;

  -- So the destination sorts by real activity, not by when it was made.
  if p_project_id is not null then
    update public.projects set updated_at = now() where id = p_project_id;
  end if;

  return true;
end;
$$;

revoke all on function public.move_task_to_project(uuid, uuid) from public, anon;
grant execute on function public.move_task_to_project(uuid, uuid) to authenticated;

-- Catch up anything placed between the projects migration and the fix to
-- forge-submit, which had its own copy of the insert and so never learned
-- about project_id. Same loop as 0034; it only touches unassigned rows.
do $$
declare
  task_row record;
  new_project_id uuid;
  derived_name text;
begin
  for task_row in
    select id, user_id, type, payload, created_at
    from public.tasks
    where user_id is not null and project_id is null
    order by created_at
  loop
    derived_name := nullif(trim(coalesce(
      task_row.payload ->> 'projectName',
      task_row.payload ->> 'businessName',
      task_row.payload ->> 'description',
      task_row.payload ->> 'brief',
      ''
    )), '');

    if derived_name is null then
      derived_name := initcap(replace(task_row.type, '-', ' '));
    elsif length(derived_name) > 60 then
      derived_name := left(derived_name, 57) || '...';
    end if;

    insert into public.projects (user_id, name, created_at, updated_at)
    values (task_row.user_id, derived_name, task_row.created_at, task_row.created_at)
    returning id into new_project_id;

    update public.tasks set project_id = new_project_id where id = task_row.id;
  end loop;
end $$;
