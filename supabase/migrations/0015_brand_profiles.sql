-- Cached brand identity extracted from a client's existing website.
--
-- The promise on the service pages is "send us your URL and we'll match your
-- branding". Until now only brand-kit did anything with a URL, and only two
-- hex colours -- every other product ignored it, and the PDF page's own label
-- ("auto-pulls logo, colors, copy & socials") described something that was
-- never built.
--
-- Extraction costs a screenshot plus a vision call, so it is cached rather
-- than repeated per task. A client ordering a letterhead, a business card and
-- a social pack for the same site pays that cost once and gets the SAME
-- colours across all three -- consistency matters more here than freshness.
--
-- Keyed by URL alone, not per user: a public website's brand is the same fact
-- whoever asks. Rows are refreshed when older than the staleness window
-- (see _shared/brandProfile.ts), so a client who redesigns their site and
-- reorders gets the new look.
create table if not exists public.brand_profiles (
  url text primary key,
  profile jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

create index if not exists brand_profiles_fetched_at_idx on public.brand_profiles (fetched_at);

-- Worker-only, like the other pipeline tables: the service role bypasses RLS,
-- and no client SDK reads this directly.
alter table public.brand_profiles enable row level security;
