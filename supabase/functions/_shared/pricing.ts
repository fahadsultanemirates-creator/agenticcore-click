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
    // Counted in PAGES now, not sections, and the ranges no longer
    // overlap: 1-4 is small, 5-10 is large, so a page count never fits
    // both and nobody has to adjudicate a 4.
    case 'website':
      if (payload.tier === 'small') return WEBSITE_SMALL_USD;
      if (payload.tier === 'large') return WEBSITE_LARGE_USD;
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

    // One price, whatever is in the clip.
    //
    // It used to vary by resolution, which was never a real difference to
    // sell: every clip is 1080p now, and an avatar costs us the same as a
    // moving scene. A video is a video.
    case 'video':
      return VIDEO_USD;

    default:
      return null;
  }
}

/** One clip, one price, avatar or not. */
export const VIDEO_USD = 3;

/** Every clip is 1080p. There is no cheaper tier to choose any more. */
export const VIDEO_RESOLUTION = '1080p' as const;

/** The length we sell: 10 to 15 seconds. */
export const MIN_VIDEO_SECONDS = 10;
export const MAX_VIDEO_SECONDS = 15;

/** Pages, not sections, and the two ranges do not overlap. */
export const WEBSITE_SMALL_USD = 10;
export const WEBSITE_LARGE_USD = 20;
export const WEBSITE_SMALL_PAGES = { min: 1, max: 4 } as const;
export const WEBSITE_LARGE_PAGES = { min: 5, max: 10 } as const;

/**
 * Which tier a page count falls into.
 *
 * One place, because "5 pages" arrives from the website form, from Forge,
 * and from a line of Telegram text, and three readings of the same number
 * is how a client is quoted one price and charged another. Null above the
 * ceiling: ten pages is the product, not a starting point.
 */
export function websiteTierForPages(pages: number): 'small' | 'large' | null {
  if (!Number.isFinite(pages) || pages < WEBSITE_SMALL_PAGES.min) return null;
  if (pages <= WEBSITE_SMALL_PAGES.max) return 'small';
  if (pages <= WEBSITE_LARGE_PAGES.max) return 'large';
  return null;
}

export const REAL_TASK_TYPES = new Set(['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit']);

export const FULL_BUSINESS_SETUP_USD = 20;

// Owner-only for now: the price is settled, but business-report is
// deliberately NOT in REAL_TASK_TYPES -- no service page, no Forge support,
// no client-facing submit path until that build is given the go-ahead.
export const BUSINESS_REPORT_USD = 5;

// Every image task returns 5 options to pick from, for one flat price.
export const IMAGE_OPTION_COUNT = 5;
