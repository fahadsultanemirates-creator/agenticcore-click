-- Applied via the connected Supabase account. Connection keys are provisioned separately and never committed.
create table public.framework_sites(site text primary key,url text not null,bridge_key text not null,enabled boolean not null default false);
alter table public.framework_sites enable row level security;
revoke all on public.framework_sites from public,anon,authenticated;
grant all on public.framework_sites to service_role;
alter table public.framework_sites add column last_block bigint;
