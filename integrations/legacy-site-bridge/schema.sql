-- Apply to Agency and Biz, substituting SITE_PREFIX with AGN or BIZ.
begin;
create table public.framework_bridge_access(id text primary key,key_hash text not null);
create table public.framework_events(id uuid primary key default gen_random_uuid(),kind text not null,record_id uuid not null,payload jsonb not null,created_at timestamptz not null default now(),claimed_until timestamptz,delivered_at timestamptz,unique(kind,record_id));
alter table public.framework_bridge_access enable row level security;alter table public.framework_events enable row level security;
revoke all on public.framework_bridge_access,public.framework_events from public,anon,authenticated;grant all on public.framework_bridge_access,public.framework_events to service_role;
create function public.claim_framework_events() returns setof public.framework_events language sql security invoker set search_path='' as $$update public.framework_events set claimed_until=now()+interval '5 minutes' where id in(select id from public.framework_events where delivered_at is null and (claimed_until is null or claimed_until<now()) order by created_at limit 10 for update skip locked) returning *;$$;
revoke all on function public.claim_framework_events() from public,anon,authenticated;grant execute on function public.claim_framework_events() to service_role;
create schema if not exists framework_private;revoke all on schema framework_private from public,anon,authenticated;
create function framework_private.queue_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='requests' then
 insert into public.framework_events(kind,record_id,payload) values('legacy_request',new.id,jsonb_build_object('reference',tg_argv[0]||'-'||new.id,'site',tg_argv[0],'category',new.service_category,'brief',left(new.description,2600),'agreed_price',new.agreed_price,'status',new.status)) on conflict do nothing;
 elsif new.status='paid' and (tg_op='INSERT' or old.status is distinct from new.status) then
 insert into public.framework_events(kind,record_id,payload) values('legacy_payment',new.id,jsonb_build_object('reference',tg_argv[0]||'-'||new.request_id,'site',tg_argv[0],'amount',new.amount,'status',new.status)) on conflict do nothing;
 end if;return new;
end $$;
revoke all on function framework_private.queue_event() from public,anon,authenticated;
create trigger framework_request_alert after insert on public.requests for each row execute function framework_private.queue_event('SITE_PREFIX');
create trigger framework_payment_alert after insert or update of status on public.billing for each row execute function framework_private.queue_event('SITE_PREFIX');
alter table public.project_deliverables add column bridge_event_id text unique;
create function public.record_framework_delivery(p_order_id uuid,p_event_id text,p_path text,p_filename text) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.requests;project uuid;delivery uuid;
begin
 select * into r from public.requests where id=p_order_id for update;if r.id is null then raise exception 'Request not found';end if;
 select id into delivery from public.project_deliverables where bridge_event_id=p_event_id;if delivery is not null then return delivery;end if;
 if p_path not like r.user_id::text||'/%' then raise exception 'Invalid file path';end if;
 select id into project from public.projects where request_id=r.id and user_id=r.user_id limit 1;
 if project is null then insert into public.projects(request_id,user_id,project_name,status) values(r.id,r.user_id,'Service '||r.service_category,'delivered') returning id into project;end if;
 delivery:=gen_random_uuid();insert into public.project_deliverables(id,project_id,user_id,label,storage_path,content_type,bridge_event_id,notes) values(delivery,project,r.user_id,p_filename,p_path,'application/octet-stream',p_event_id,'Delivered through the shared AgenticCore bot.');update public.projects set status='delivered' where id=project;return delivery;
end $$;
revoke all on function public.record_framework_delivery(uuid,text,text,text) from public,anon,authenticated;grant execute on function public.record_framework_delivery(uuid,text,text,text) to service_role;
commit;
