-- Safety-net sweep for pending voice clones (create-custom-voice kicks
-- off the HeyGen training job; this cron picks up completion).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'voice-clone-poll-sweep') then
    perform cron.unschedule('voice-clone-poll-sweep');
  end if;
end $$;

select cron.schedule(
  'voice-clone-poll-sweep',
  '*/2 * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/voice-clone-poll',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb
  );
  $sql$
);
