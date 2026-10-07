-- Letting an empty project go.
--
-- 0034 deliberately had no delete policy: a project holds paid-for work,
-- and work people paid for should not be one tap from gone. That still
-- holds. What it did not anticipate is the leftover -- move the only
-- order out of a project and the folder stays forever, unnameable as
-- anything useful and impossible to remove. The backfill guarantees
-- these: it gave every old order its own project, so consolidating two
-- of them always strands one.
--
-- So: deletable, but only when it holds nothing. The `not exists` is the
-- whole safety property, and it is enforced in the database rather than
-- by the button, because a button is not a rule.
--
-- The subquery reads tasks under the caller's own RLS, which is correct
-- here: a project's tasks always carry the same user_id as the project,
-- so there is no row the owner could fail to see and thereby delete a
-- project that still has work in it.

drop policy if exists "empty projects are deleted by their owner" on public.projects;
create policy "empty projects are deleted by their owner"
  on public.projects for delete
  using (
    auth.uid() = user_id
    and not exists (select 1 from public.tasks where tasks.project_id = projects.id)
  );
