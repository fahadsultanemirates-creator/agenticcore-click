-- reference_id is PayRam's own identifier for a payment session (distinct
-- from invoice_id, which is the value *we* generate and send to PayRam).
-- Needed to poll PayRam's GET /api/v1/payment/reference/{reference_id}
-- status endpoint directly -- .click checks PayRam itself now instead of
-- relying on .agency's relay, since PayRam only calls .agency's webhook
-- URL and that relay chain proved too fragile to depend on.
alter table public.wallet_topups add column if not exists reference_id text;

-- Never enabled originally -- any authenticated user could read any other
-- user's balance/topup history via the client. Edge Functions use the
-- service role key (bypasses RLS entirely), so this only restricts direct
-- client-side reads to a user's own rows.
alter table public.wallets enable row level security;
alter table public.wallet_topups enable row level security;

create policy "Users can read their own wallet" on public.wallets
  for select using (auth.uid() = user_id);

create policy "Users can read their own wallet topups" on public.wallet_topups
  for select using (auth.uid() = user_id);
