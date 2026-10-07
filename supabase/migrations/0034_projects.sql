-- Projects: the thing a client actually has, which is not a list of orders.
--
-- A logo, then a flyer using that logo, then a business card to match, are
-- one piece of work. The dashboard held them as three unrelated rows in a
-- history table, under the wallet and the service grid and the billing
-- section, and the only way to reuse the logo in the flyer was to download
-- it and upload it again.
--
-- A project is a named container. Orders belong to one; a new order can
-- join an existing project and start with that project's finished files
-- already attached as reference.
--
-- project_id is NULLABLE on purpose. A task that fails to find or make a
-- project must still be created -- the client has been charged by then,
-- and losing the order to keep the grouping tidy is the wrong trade.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id, updated_at desc);

alter table public.tasks add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists tasks_project_id_idx on public.tasks (project_id);

alter table public.projects enable row level security;

-- A client sees and names their own projects and nobody else's. Deletion is
-- deliberately absent: a project holds paid-for work, and the orders in it
-- outlive any tidying up.
drop policy if exists "projects are readable by their owner" on public.projects;
create policy "projects are readable by their owner"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "projects are created by their owner" on public.projects;
create policy "projects are created by their owner"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "projects are renamed by their owner" on public.projects;
create policy "projects are renamed by their owner"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Backfill: one project per existing client order.
--
-- One per order rather than one per client, because we do not know that
-- two old orders were related and inventing that grouping would be a lie
-- the client then has to unpick. Name from the brief where there is one --
-- it is what they wrote -- and the product otherwise.
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
