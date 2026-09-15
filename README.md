# agenticcore.click

Fast, cheap, self-serve AI business kit — the light sister site to
AgenticCore.agency / AgenticCore.biz. Pitch: **start a business in 20
minutes for $20** (placeholder figures, tbd).

## What's here

- **Landing page** (`/`) — hero, how it works, services grid, packages,
  stats band, FAQ, CTA. The header carries log in / sign up (or the
  account menu when signed in) and a mobile menu for the section links.
- **Dashboard** (`/dashboard`) — a single scrolling page: welcome +
  wallet balance, the service grid, deliverables, request history, then
  billing. There is no left service rail; the grid is the navigation.
- **Service pages** (`/dashboard/<service>`) — each service opens its own
  full-width page, reached from the grid and left via the header's back
  button.
- **Forge** (`/dashboard/forge`) — conversational intake that scopes and
  queues tasks for you instead of filling in a form.

Service definitions (label, icon, tagline, **price**, turnaround) live in
one place: `src/data/services.ts`. The landing grid, the dashboard cards
and each service page header all read from it, so a price change is a
one-line edit. The server-side source of truth for what actually gets
charged is `supabase/functions/_shared/pricing.ts` — keep the two in
step.

## Stack

Vite + React + TypeScript + Tailwind CSS v4 + React Router + lucide-react
icons, on Supabase (Auth, Postgres, Storage, Edge Functions).

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build   # typecheck + production build
npm run lint    # oxlint
```

## Still to do

- The dashboard's deliverables and request history read sample rows from
  `src/data/orders.ts` — they need wiring to the real `tasks` /
  `task_files` data.
- Wallet tier discounts (`src/data/packages.ts`) are defined but not yet
  applied at pricing time.
