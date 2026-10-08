-- Counting visits, without following anybody.
--
-- No cookie, no device id, no stored IP. visitor_hash is
-- sha256(daily salt + ip + user agent), and the salt changes every day,
-- so the same person is one visitor within a day and an unrelated one
-- tomorrow. That answers "how many people came today" and deliberately
-- cannot answer "did this person come back on Friday" -- which is also
-- why it needs no consent banner.
--
-- No policies at all, on purpose. RLS is on and nothing is granted, so
-- the table is reachable only by the service role: the edge function
-- that records a visit, and the owner command that reads it. A browser
-- cannot read these rows, and it cannot write one either -- it asks the
-- function, which derives the hash server-side from headers the client
-- does not control. Otherwise anyone could post a thousand made-up
-- visitors and the only number the owner acts on would be fiction.

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  seen_at timestamptz not null default now(),
  path text not null,
  referrer_host text not null default 'direct',
  visitor_hash text not null,
  -- Recorded rather than discarded: a day that looks empty is worth
  -- telling apart from a day that was all crawlers.
  is_bot boolean not null default false
);

-- Every query is "a window of time, people only".
create index if not exists page_views_seen_at_idx on public.page_views (seen_at desc) where not is_bot;
create index if not exists page_views_visitor_idx on public.page_views (visitor_hash, seen_at desc) where not is_bot;

alter table public.page_views enable row level security;
