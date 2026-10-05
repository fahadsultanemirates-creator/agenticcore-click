-- HeyGen is no longer a dependency, so the parts of the schema that only
-- existed to serve it are retired.
--
-- Avatar clips are now rendered by an external agent on their own machine.
-- Nothing in this project picks a presenter from a library, uploads a
-- talking photo, or clones a voice any more, and the functions that did
-- (create-custom-avatar, create-custom-voice, voice-clone-poll,
-- heygen-catalog) have been deleted.
--
-- The cron sweep goes first, because it is the part that actively breaks:
-- pg_cron would keep calling a function that no longer exists, every two
-- minutes, forever, with the failure visible only in the logs.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'voice-clone-poll-sweep') then
    perform cron.unschedule('voice-clone-poll-sweep');
  end if;
end $$;

-- The tables are KEPT, deliberately.
--
-- client_avatars holds photos and voice recordings that clients uploaded,
-- and catalog_options holds the picker the owner curated by hand. Dropping
-- them would destroy both, irreversibly, to save nothing: nothing reads
-- them now, so they cost only disk.
--
-- What does change is that they stop accepting new rows. A table nothing
-- writes to is tidy; a table nothing writes to but that still *could* be
-- written to is a trap for whoever next wires something up to it.
revoke insert, update on public.client_avatars from anon, authenticated;
revoke insert, update on public.catalog_options from anon, authenticated;

comment on table public.client_avatars is
  'Retired with HeyGen (migration 0026). Read-only history of client-uploaded '
  'avatar photos and voice samples. Nothing reads this; kept so the uploads '
  'are not destroyed.';

comment on table public.catalog_options is
  'Retired with HeyGen (migration 0026). Read-only history of the curated '
  'avatar/voice picker. Nothing reads this.';
