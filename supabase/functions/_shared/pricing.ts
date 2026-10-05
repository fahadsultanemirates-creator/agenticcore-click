// Server-side pricing, the single source of truth for every task price.
// Mirrored for display by src/data/services.ts (dashboard cards + service
// page headers) and src/pages/services/VideoPage.tsx's own tables -- kept in
// sync by hand, since the frontend is a static SPA with no shared build step
// with these functions. Returns null for a payload that doesn't map to a
// real price (invalid/incomplete selection), which the caller must reject
// rather than guess a default.
//
// Extracted out of submit-task so forge-submit can reuse the exact same
// logic instead of a second copy that could drift.
export function calculatePriceUsd(type: string, payload: Record<string, unknown>): number | null {
  switch (type) {
    case 'website':
      if (payload.tier === 'small') return 10;
      if (payload.tier === 'large') return 20;
      return null;

    case 'pdf':
      return 3;

    case 'social':
      return 2;

    case 'documents':
      return 5;

    case 'brand-kit':
      return 5;

    case 'image':
      return 1;

    // Every video is now a single clip of 15 seconds or less, so the only
    // thing that moves the price is resolution. The long tier is gone: it
    // was billed in 30-second blocks against HeyGen's rate, and HeyGen is
    // no longer a dependency.
    case 'video':
      if (payload.resolution === '720p') return SHORT_VIDEO_720P_USD;
      if (payload.resolution === '1080p') return SHORT_VIDEO_1080P_USD;
      return null;

    default:
      return null;
  }
}

export const SHORT_VIDEO_720P_USD = 1;
export const SHORT_VIDEO_1080P_USD = 1.5;

/** The hard cap on a clip, and the only length we sell. */
export const MAX_VIDEO_SECONDS = 15;

export const REAL_TASK_TYPES = new Set(['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit']);

export const FULL_BUSINESS_SETUP_USD = 20;

// Owner-only for now: the price is settled, but business-report is
// deliberately NOT in REAL_TASK_TYPES -- no service page, no Forge support,
// no client-facing submit path until that build is given the go-ahead.
export const BUSINESS_REPORT_USD = 5;

// Every image task returns 5 options to pick from, for one flat price.
export const IMAGE_OPTION_COUNT = 5;
