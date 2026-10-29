create or replace function public.settle_framework_ac_invoice(p_invoice_id uuid,p_tx_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
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
