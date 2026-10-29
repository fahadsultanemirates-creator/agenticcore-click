-- Substitute FRACTION_DIGITS (10 for Biz, 12 for Agency), FRACTION_MASK and SITE_PREFIX.
begin;
create sequence public.framework_ac_nonce minvalue 1 maxvalue 999999 no cycle;
create table public.framework_payment_invoices(id uuid primary key default gen_random_uuid(),billing_id uuid not null references public.billing(id),user_id uuid not null,base_usd numeric not null,discount_cents bigint not null,expected_amount text not null unique,status text not null default 'pending' check(status in ('pending','paid','cancelled','expired')),tx_hash text unique,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours');
create unique index framework_ac_pending_bill on public.framework_payment_invoices(billing_id) where status='pending';
alter table public.framework_payment_invoices enable row level security;revoke all on public.framework_payment_invoices from public,anon,authenticated;grant select on public.framework_payment_invoices to authenticated;grant all on public.framework_payment_invoices to service_role;grant usage on sequence public.framework_ac_nonce to service_role;
create policy framework_ac_read_self on public.framework_payment_invoices for select to authenticated using(user_id=(select auth.uid()));
create function public.create_framework_ac_invoice(p_user_id uuid,p_bill_id uuid) returns public.framework_payment_invoices language plpgsql security invoker set search_path='' as $$
declare b public.billing;i public.framework_payment_invoices;n bigint;cents bigint;
begin
 if now()>='2027-04-29T00:00:00Z'::timestamptz then raise exception 'The fixed AC rate has expired';end if;
 select * into b from public.billing where id=p_bill_id and user_id=p_user_id for update;
 if b.id is null or b.status<>'pending' or b.amount<=0 then raise exception 'No payable invoice';end if;
 update public.framework_payment_invoices set status='expired' where billing_id=b.id and status='pending' and expires_at<now();
 select * into i from public.framework_payment_invoices where billing_id=b.id and status='pending';if i.id is not null and i.base_usd=b.amount then return i;elsif i.id is not null then update public.framework_payment_invoices set status='cancelled' where id=i.id;end if;
 n:=nextval('public.framework_ac_nonce');while n%100=0 loop n:=nextval('public.framework_ac_nonce');end loop;
 cents:=round(b.amount*100*0.9);
 insert into public.framework_payment_invoices(billing_id,user_id,base_usd,discount_cents,expected_amount) values(b.id,p_user_id,b.amount,round(b.amount*100)-cents,to_char(ceil(cents::numeric*50000000000/3)/1000000+n::numeric/power(10::numeric,FRACTION_DIGITS),'FM999999999999999999990.FRACTION_MASK')) returning * into i;return i;
end $$;
revoke all on function public.create_framework_ac_invoice(uuid,uuid) from public,anon,authenticated;grant execute on function public.create_framework_ac_invoice(uuid,uuid) to service_role;
create function public.settle_framework_ac_invoice(p_invoice_id uuid,p_tx_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare i public.framework_payment_invoices;b public.billing;
begin
 if p_tx_hash !~ '^0x[0-9a-f]{64}$' then raise exception 'Invalid transaction';end if;
 select * into i from public.framework_payment_invoices where id=p_invoice_id;
 if i.id is null or i.status<>'pending' or i.expires_at<now() then return false;end if;
 select * into b from public.billing where id=i.billing_id for update;
 if b.status<>'pending' or b.amount<>i.base_usd then return false;end if;
 update public.framework_payment_invoices set status='paid',tx_hash=p_tx_hash where id=i.id and status='pending';if not found then return false;end if;
 update public.billing set status='paid',paid_at=now() where id=b.id;
 if b.request_id is not null and b.payment_type in ('upfront','full') then
  update public.requests set status='confirmed' where id=b.request_id and user_id=b.user_id and status='awaiting_payment';
  if not exists(select 1 from public.projects where request_id=b.request_id and user_id=b.user_id) then
   insert into public.projects(request_id,user_id,project_name,status) select r.id,r.user_id,'Service '||r.service_category,'in_progress' from public.requests r where r.id=b.request_id;
  end if;
 end if;return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.settle_framework_ac_invoice(uuid,text) from public,anon,authenticated;grant execute on function public.settle_framework_ac_invoice(uuid,text) to service_role;
commit;
