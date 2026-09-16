-- Two leftovers from the same family as 0017, both found by the database
-- linter straight after that migration landed.
--
-- 1. bot_settings was still RLS-off with anon holding full read/write/delete.
--    It holds one row -- the owner's chosen bot language -- so the value at
--    risk is small, but the shape is identical to the tasks tables: a table
--    reachable by anyone holding the anon key, which ships in the browser
--    bundle. Only the Telegram bot touches it, through the service role, so
--    it needs no client access at all.
--
-- 2. mark_task_seen, added in 0017, is SECURITY DEFINER and was granted to
--    authenticated -- but Supabase's default privileges also grant EXECUTE on
--    a new function to anon, and "revoke all from public" does not remove a
--    direct grant to a named role. Not exploitable (the function's own
--    where-clause pins it to auth.uid(), which is null for anon, so it
--    matches no rows), but a SECURITY DEFINER function callable by anybody is
--    not something to leave lying around on the assumption its body stays
--    safe forever.

alter table public.bot_settings enable row level security;
revoke all on public.bot_settings from anon, authenticated;

revoke execute on function public.mark_task_seen(uuid) from anon;
