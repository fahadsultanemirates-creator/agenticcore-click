-- Nightly owner wrap-up at 23:00 Asia/Dubai (UTC+4, no DST) = 19:00 UTC.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-summary-sweep') then
    perform cron.unschedule('daily-summary-sweep');
  end if;
end $$;

select cron.schedule(
  'daily-summary-sweep',
  '0 19 * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/daily-summary',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb
  );
  $sql$
);
