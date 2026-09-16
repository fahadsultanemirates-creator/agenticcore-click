-- How many people have actually signed up.
--
-- /stats reported "Accounts: 0 total, 2 funded", which is a contradiction on
-- its face. Both halves were true and the label was wrong: it counted rows in
-- client_accounts, and a row there is only created when an account places its
-- FIRST order, since that is when an account number is allocated. Every
-- existing task predates that migration, so the table was empty while nine
-- people had real signed-up accounts and two of them had money in a wallet.
--
-- The count has to come from auth.users, which PostgREST does not expose, so
-- it needs a function. SECURITY DEFINER to read the auth schema, granted to
-- service_role only -- it returns a single number and nothing about any
-- individual user, but there is no reason for a client to call it at all.

create or replace function public.count_registered_users()
returns integer
language sql
security definer
set search_path = auth, public
as $$
  select count(*)::integer from auth.users;
$$;

revoke all on function public.count_registered_users() from public, anon, authenticated;
grant execute on function public.count_registered_users() to service_role;
