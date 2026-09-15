-- Safety-net sweep for worker-pdf's phase 2 hand-off (see worker-pdf /
-- worker-pdf-render): the hand-off itself is a fire-and-forget call, same
-- as the dispatcher/video-poll sweeps in 0007_cron.sql -- this is the
-- fallback in case that specific call got dropped, or worker-pdf-render
-- itself died mid-render (its own execution window, but not infinite).
--
-- Only retries tasks whose payload still carries an unconsumed
-- pendingSpec and haven't been touched in the last 90s, so it never races
-- a render that's still actually in flight.
--
-- Auth: the anon key is fine here, same reasoning as 0007_cron.sql --
-- worker-pdf-render runs everything through its own service-role client
-- regardless of caller identity, so the caller's JWT only has to pass the
-- platform's verify_jwt gate.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pdf-render-sweep') then
    perform cron.unschedule('pdf-render-sweep');
  end if;
end $$;

select cron.schedule(
  'pdf-render-sweep',
  '*/2 * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/worker-pdf-render',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb,
    body := jsonb_build_object('taskId', t.id)
  )
  from public.tasks t
  where t.status = 'in_progress'
    and t.type in ('pdf', 'documents', 'brand-kit')
    and t.payload ? 'pendingSpec'
    and t.updated_at < now() - interval '90 seconds';
  $sql$
);
