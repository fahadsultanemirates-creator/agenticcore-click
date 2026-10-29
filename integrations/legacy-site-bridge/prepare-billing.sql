begin;
create function public.prepare_framework_bill(p_user_id uuid,p_request_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.requests;b uuid;
begin
 select * into r from public.requests where id=p_request_id and user_id=p_user_id for update;
 if r.id is null or r.status<>'awaiting_payment' or r.agreed_price is null or r.agreed_price<=0 then raise exception 'Agree a price before payment';end if;
 select id into b from public.billing where request_id=r.id and user_id=p_user_id and payment_type='upfront' and status='pending' limit 1;
 if b is null then insert into public.billing(user_id,request_id,amount,payment_type,status) values(p_user_id,r.id,round(r.agreed_price*0.3,2),'upfront','pending') returning id into b;end if;
 return b;
end $$;
revoke all on function public.prepare_framework_bill(uuid,uuid) from public,anon,authenticated;grant execute on function public.prepare_framework_bill(uuid,uuid) to service_role;
commit;
