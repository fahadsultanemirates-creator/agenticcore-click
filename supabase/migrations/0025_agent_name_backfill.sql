-- One agent, two spellings.
--
-- Jobs were opened as 'grokbot' while routing, /assign and agent_routes all
-- used 'worker-grokbot'. A task handed back recorded the short name, the
-- router looked for the long one, found no match, and offered the task
-- straight back to the agent that had just returned it.
--
-- The code now uses a closed type so the short spelling will not compile.
-- This repairs anything already written under it. On this project it
-- matched nothing -- no external job has ever run -- but a migration that
-- only works on an empty table is not a migration.

update public.agent_jobs
set agent = 'worker-grokbot'
where agent = 'grokbot';

-- excluded_agents is an array, so the short name has to be swapped inside
-- it rather than compared to it.
update public.tasks
set excluded_agents = array_replace(excluded_agents, 'grokbot', 'worker-grokbot')
where 'grokbot' = any(excluded_agents);

update public.tasks
set assigned_agent = 'worker-grokbot'
where assigned_agent = 'grokbot';

update public.agent_routes
set agent = 'worker-grokbot'
where agent = 'grokbot';
