-- Owner tasks get their own numbers: AC-OWNER-0001.
--
-- Until now everything the owner raised from Telegram was AC-CLICK-####,
-- which is also the form every pre-numbering client task carries. Two
-- different kinds of work sharing one namespace is exactly what made a
-- conversation about "that video" ambiguous -- the reference itself said
-- nothing about whose it was. A client order already reads AC-1007-03
-- ("account 1007's third order"); the owner's own work now reads
-- AC-OWNER-0001, so the prefix alone answers "is this mine or a client's?".
--
-- The old generatePublicId counted rows in tasks and added one, which is not
-- a counter: delete a task and the next one reuses a number, and two
-- simultaneous inserts read the same count. A sequence cannot do either.

create sequence if not exists owner_task_no_seq start 1;

create or replace function public.allocate_owner_task()
returns integer
language sql
as $$
  select nextval('owner_task_no_seq')::integer;
$$;

revoke all on function public.allocate_owner_task() from public, anon, authenticated;
grant execute on function public.allocate_owner_task() to service_role;

-- Existing AC-CLICK-#### ids are deliberately left alone. They are printed on
-- deliverables already sent and referenced in this chat's history; renaming
-- them would break every one of those references to tidy up a handful of rows.
-- Both forms stay recognised.
