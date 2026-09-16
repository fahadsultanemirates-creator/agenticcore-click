-- Take the wallet and queue functions away from clients.
--
-- increment_wallet_balance, deduct_wallet_balance, refund_wallet_balance,
-- claim_next_task and allocate_order were all executable by anon and
-- authenticated over the REST API at /rest/v1/rpc/<name>. increment_wallet_
-- balance is the one that matters: its whole body is
--
--     insert into wallets (user_id, balance_usd) values (p_user_id, p_amount)
--     on conflict (user_id) do update set balance_usd = balance_usd + excluded...
--
-- i.e. "add this much money to this account", callable by anyone signed in.
--
-- It does not work today, and the reason is worth stating because it is not
-- the reason anybody intended: the functions are SECURITY INVOKER, so they run
-- as the caller, and `wallets` has RLS on with a SELECT policy and no write
-- policy -- so the insert is refused. The money is safe by accident. Add a
-- perfectly reasonable-sounding "users can update their own wallet" policy one
-- day and increment_wallet_balance silently becomes a free-money endpoint.
--
-- Nothing client-side calls any of them. Every caller is an edge function
-- using the service role, which is unaffected by these revokes (it bypasses
-- both RLS and, being a superuser-equivalent role, these grants). The only
-- client-callable function left is mark_task_seen, which is meant to be.
--
-- search_path is pinned at the same time: an unqualified name in a function
-- body resolves through the caller's search_path, so without this a caller who
-- can create objects could shadow a table the function references. These
-- bodies are fully qualified today, which again is a property of the current
-- text rather than a guarantee.

-- Revoked from PUBLIC, not from anon/authenticated. Postgres grants EXECUTE on
-- a new function to PUBLIC by default, and both client roles inherit it from
-- there -- so revoking from the named roles alone changes nothing at all.
-- Checked with has_function_privilege('anon', ...) after the first attempt,
-- which still came back true.
revoke execute on function public.increment_wallet_balance(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.deduct_wallet_balance(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.refund_wallet_balance(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.claim_next_task() from public, anon, authenticated;
revoke execute on function public.allocate_order(uuid) from public, anon, authenticated;

-- Granted back explicitly: revoking from PUBLIC also takes it from
-- service_role, which is the one role that must keep it -- every real caller
-- is an edge function using the service role.
grant execute on function public.increment_wallet_balance(uuid, numeric, text) to service_role;
grant execute on function public.deduct_wallet_balance(uuid, numeric) to service_role;
grant execute on function public.refund_wallet_balance(uuid, numeric) to service_role;
grant execute on function public.claim_next_task() to service_role;
grant execute on function public.allocate_order(uuid) to service_role;

alter function public.increment_wallet_balance(uuid, numeric, text) set search_path = public;
alter function public.deduct_wallet_balance(uuid, numeric) set search_path = public;
alter function public.refund_wallet_balance(uuid, numeric) set search_path = public;
alter function public.claim_next_task() set search_path = public;
alter function public.allocate_order(uuid) set search_path = public;
