-- The telegram sweep now has a second job, and it must run even when the
-- first one has nothing to do.
--
-- 0029 scheduled it with a guard: only fire when some account is still
-- without a password. Correct then -- an idle project should not make
-- 24 pointless requests a day.
--
-- It now also re-registers the bot's command menu (setMyCommands), which
-- is what puts the blue Menu button in a client's chat. That has to
-- happen whether or not anybody is mid-signup, and with zero accounts
-- the guard means never: the menu would simply never appear, with
-- nothing failing anywhere to say so.
--
-- One request an hour is the whole cost.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'telegram-account-sweep') then
    perform cron.unschedule('telegram-account-sweep');
  end if;
end $$;

select cron.schedule(
  'telegram-account-sweep',
  '17 * * * *',
  $sql$
  select net.http_post(
    url := 'https://vuutmxrunxkjydcryeoa.supabase.co/functions/v1/telegram-sweep',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1dXRteHJ1bnhranlkY3J5ZW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMTQ5NzUsImV4cCI6MjEwNDg5MDk3NX0.pw4zVYf97vlqRZgvYIce11Mz7LcvyonDCnWVGqXeQPs"}'::jsonb,
    body := '{}'::jsonb
  );
  $sql$
);
