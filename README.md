# agenticcore.click

Fast, cheap, self-serve AI business kit — the light sister site to
AgenticCore.agency / AgenticCore.biz. Pitch: **start a business in 20
minutes for $20** (placeholder figures, tbd).

This is phase 1: a landing page plus a **non-functional dashboard mockup**
to lock in visual design before any real backend/auth/generation is built.

## What's here

- **Landing page** (`/`) — single page, short sections: hero, how it
  works, services grid, stats band, FAQ, CTA.
- **Dashboard mockup** (`/dashboard`) — left service menu + a
  single-prompt brief flow (Beautiful.ai / AdCreative-style). Switching
  services and clicking "Generate" is simulated client-side only — no
  network calls, no auth, no real generation.

Service definitions (label, icon, prompt copy, quick-pick chips,
placeholder price/eta) live in one place: `src/data/services.ts`. Both the
landing page's services grid and the dashboard sidebar read from it, so
adding a new service later means editing one file.

## Stack

Vite + React + TypeScript + Tailwind CSS v4 + React Router + lucide-react
icons. No backend, no state persistence — intentionally, for this phase.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build   # typecheck + production build
npm run lint    # oxlint
```

## Next phase (not built yet)

Real auth, dashboard functionality, brief submission, AI generation
backend, billing. The component structure (`data/services.ts`,
`pages/Dashboard.tsx`, `components/dashboard/*`) is set up to be extended
rather than rebuilt.
