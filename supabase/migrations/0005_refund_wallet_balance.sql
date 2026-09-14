-- Dedicated refund path -- increment_wallet_balance also sets `tier`
-- (correct for a real top-up, since that's exactly when tier changes),
-- so reusing it for a refund would wipe the user's tier back to
-- whatever was passed in. This only touches balance_usd.
create or replace function public.refund_wallet_balance(
  p_user_id uuid,
  p_amount numeric
) returns void
language sql
as $$
  update public.wallets
    set balance_usd = balance_usd + p_amount,
        updated_at = now()
    where user_id = p_user_id;
$$;
