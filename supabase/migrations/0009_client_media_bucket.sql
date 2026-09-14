-- Holds the photo/audio a client uploads when creating their own custom
-- avatar/voice -- public-read (same unguessable-path model as
-- deliverables) so the source photo/audio can preview in their dashboard.
insert into storage.buckets (id, name, public)
values ('client-media', 'client-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to client-media" on storage.objects;
create policy "Public read access to client-media"
  on storage.objects for select
  using (bucket_id = 'client-media');
