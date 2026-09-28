-- Four things the first review of the external-agent path found missing.
--
-- 1. A task an agent hands back has to be able to say WHICH agent handed it
--    back. Without that, clearing assigned_agent is not enough: the product
--    is still routed to that agent, so the dispatcher offers it straight
--    back and the task ping-pongs forever. This is the worst of the four --
--    it is an infinite loop that costs a webhook call every two minutes.
--
-- 2. An accepted job needs a deadline of its own. accept_deadline only
--    governs the offer; once accepted, a job that goes quiet sat open
--    indefinitely with nothing watching it.
--
-- 3. A repeated upload needs to be recognisable as the same upload, or an
--    agent retrying after a dropped connection stages the same file twice
--    and the client receives it twice.

-- 1. Agents that have already given this task back.
alter table public.tasks add column if not exists excluded_agents text[] not null default '{}';

comment on column public.tasks.excluded_agents is
  'Agents that have already released, failed or timed out on this task. Routing skips them, so a hand-back cannot loop.';

-- 2. How long the agent has to finish, once it has accepted.
alter table public.agent_jobs add column if not exists work_deadline timestamptz;

comment on column public.agent_jobs.work_deadline is
  'Set when the job is accepted. Past it with nothing submitted, the task goes back to a built-in worker.';

-- The sweep asks two questions now -- unaccepted offers, and accepted jobs
-- that ran out of time -- so the partial index has to cover both deadlines.
drop index if exists public.agent_jobs_open_idx;
create index if not exists agent_jobs_offered_idx on public.agent_jobs(accept_deadline)
  where status = 'offered';
create index if not exists agent_jobs_working_idx on public.agent_jobs(work_deadline)
  where status = 'accepted';

-- 3. The agent's own name for a file, so a retried upload is the same file
--    rather than a second one.
alter table public.agent_job_files add column if not exists client_key text;

create unique index if not exists agent_job_files_client_key_idx
  on public.agent_job_files(job_id, client_key)
  where client_key is not null;
