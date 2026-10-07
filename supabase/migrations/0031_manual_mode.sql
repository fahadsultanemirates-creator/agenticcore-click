-- Manual mode: every order goes to the owner, nothing to a robot.
--
-- The framework can build most of what it sells. That is not the same as
-- it being trusted to, and right now it is not: the only thing proven
-- end to end is that orders arrive and money moves. So until each
-- product has been watched working, the pipeline stops one step short of
-- generating anything and hands the job to a person.
--
-- This is a setting rather than a code change on purpose. Turning the
-- robots back on, one product at a time, should be a row in a table and
-- not a deploy -- and more importantly, turning them back OFF in a hurry
-- should be too.
--
-- 'on' means manual. The default is manual, so a fresh database or a
-- missing row fails to the safe side: a task waiting for a human is a
-- delay, a task generated and billed wrongly is a refund and an apology.
insert into public.bot_settings (key, value)
values ('manual_mode', 'on')
on conflict (key) do nothing;
