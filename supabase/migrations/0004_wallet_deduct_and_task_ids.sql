-- Atomic, race-safe debit: only succeeds if the balance actually covers
-- the amount, in one statement (a separate read-then-check-then-write
-- from application code could overdraw under concurrent submissions).
create or replace function public.deduct_wallet_balance(
  p_user_id uuid,
  p_amount numeric
) returns boolean
language plpgsql
as $$
declare
  v_row_count integer;
begin
  update public.wallets
    set balance_usd = balance_usd - p_amount,
        updated_at = now()
    where user_id = p_user_id
      and balance_usd >= p_amount;
  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;
