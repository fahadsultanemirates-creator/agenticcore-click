-- Safety-net sweeps for the dispatcher/video pipeline. Both the
-- dispatcher and video-poll are called event-driven (submit-task,
-- telegram-webhook's /new, and the dispatcher's own drain-the-backlog
-- retrigger) -- this cron is just the fallback in case one of those
-- fire-and-forget calls got dropped.
--
-- Auth: the anon key is fine here (it already ships in the public
-- frontend bundle) -- both functions run every DB operation through
-- their own service-role client regardless of caller identity, so the
-- caller's JWT only has to pass the platform's verify_jwt gate, not
-- authorize anything by itself.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dispatcher-safety-net') then
    perform cron.unschedule('dispatcher-safety-net');
  end if;
  if exists (select 1 from cron.job where jobname = 'video-poll-sweep') then
    perform cron.unschedule('video-poll-sweep');
  end if;
end $$;

select cron.schedule(
  'dispatcher-safety-net',
  '*/2 * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/dispatcher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb
  );
  $sql$
);

select cron.schedule(
  'video-poll-sweep',
  '*/2 * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/video-poll',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb
  );
  $sql$
);
