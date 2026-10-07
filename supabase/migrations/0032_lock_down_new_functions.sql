-- Two functions from 0028/0029 were left callable over the REST API, and
-- five have a mutable search_path. Found by Supabase's own linter, which
-- is the point of running it after a batch of DDL rather than trusting
-- that every revoke got written.
--
-- Neither of the two is exploitable today. Both are the kind of thing
-- that becomes exploitable the next time somebody edits the body and
-- assumes nobody outside can reach it.

-- 1. queue_welcome_email is a TRIGGER function. It has no business in the
--    REST API at all: PostgREST exposes every public function, so a
--    no-argument SECURITY DEFINER trigger function is reachable at
--    /rest/v1/rpc/queue_welcome_email by anyone holding the anon key --
--    which ships in the browser bundle.
--
--    Calling it there fails today, because `new` is unassigned outside a
--    trigger. That is an accident of the body, not a boundary.
--
--    The trigger itself is unaffected: a trigger runs its function as the
--    table owner and does not consult EXECUTE grants.
revoke all on function public.queue_welcome_email() from public, anon, authenticated;

-- 2. telegram_account_paused leaks whether a given account is paused to
--    anyone who can guess or obtain a user id. Small, but it is account
--    state, and 0029 revoked every other function it added -- this one
--    was simply missed.
--
--    The callers (submit-task, forge-submit, _shared/placeOrder) all use
--    the service role, which bypasses grants entirely, so nothing that
--    legitimately calls this notices.
revoke all on function public.telegram_account_paused(uuid) from public, anon, authenticated;

-- 3. search_path, pinned.
--
--    A function without one resolves unqualified names against whatever
--    search_path the caller happens to have set. For a SECURITY DEFINER
--    function that is a privilege-escalation route: point search_path at a
--    schema you control, define your own `tasks` table in it, and the
--    function operates on yours with the owner's rights. These are not all
--    SECURITY DEFINER, but the fix costs nothing and the distinction is
--    not worth remembering correctly every time.
alter function public.claim_next_task() set search_path = public;
alter function public.allocate_owner_task() set search_path = public;
alter function public.claim_pending_emails(integer) set search_path = public;
alter function public.expire_failed_emails() set search_path = public;
alter function public.claim_telegram_update(bigint) set search_path = public;
