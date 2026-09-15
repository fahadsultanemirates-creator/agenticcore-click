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

    case 'video': {
      const length = payload.length;

      // Short (<= 15s, the cap of a single grok-imagine-video clip) is
      // priced on resolution alone -- avatar and no-avatar cost the same.
      if (length === 'short') {
        if (payload.resolution === '720p') return SHORT_VIDEO_720P_USD;
        if (payload.resolution === '1080p') return SHORT_VIDEO_1080P_USD;
        return null;
      }

      // Long is avatar-only and billed in 30-second blocks. There is no
      // no-avatar long tier: grok-imagine-video caps a clip at 15s and
      // there's no stitching pipeline, so selling a longer one would be
      // selling something we can't deliver.
      if (length === 'long') {
        if (payload.avatarStyle === 'none') return null;
        const blocks = longVideoBlocks(payload);
        return blocks === null ? null : blocks * LONG_VIDEO_BLOCK_USD;
      }

      return null;
    }

    default:
      return null;
  }
}

export const SHORT_VIDEO_720P_USD = 1;
export const SHORT_VIDEO_1080P_USD = 1.5;

// $3.00 per 30 seconds of avatar video. Derived from HeyGen's own API rate
// for the engine behind our avatars (Avatar IV photo avatar, $0.05/sec =
// $3.00 per minute) under the house rule "what HeyGen charges for a minute,
// we charge for 30 seconds" -- i.e. a 2x margin on the generation itself.
// Note HeyGen bills the same rate for 720p and 1080p, so long-video price
// depends on length only, not resolution.
export const LONG_VIDEO_BLOCK_USD = 3;
export const LONG_VIDEO_BLOCK_SECONDS = 30;
export const LONG_VIDEO_MAX_BLOCKS = 20; // 10 minutes

// Long videos are sold in whole 30-second blocks, so a 45-second request is
// two blocks. Accepts either a numeric durationSeconds or the older
// "30s"/"90s"/"2m" duration strings the dashboard and Forge still send.
export function longVideoBlocks(payload: Record<string, unknown>): number | null {
  const seconds = longVideoSeconds(payload);
  if (seconds === null || seconds <= 0) return null;
  const blocks = Math.ceil(seconds / LONG_VIDEO_BLOCK_SECONDS);
  if (blocks > LONG_VIDEO_MAX_BLOCKS) return null; // over the 10-minute ceiling
  return blocks;
}

export function longVideoSeconds(payload: Record<string, unknown>): number | null {
  const numeric = Number(payload.durationSeconds);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);

  const raw = String(payload.duration ?? '').trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds|m|min|mins|minutes)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const isMinutes = (match[2] ?? 's').startsWith('m');
  return Math.round(isMinutes ? value * 60 : value);
}

export const REAL_TASK_TYPES = new Set(['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit']);

export const FULL_BUSINESS_SETUP_USD = 20;

// Owner-only for now: the price is settled, but business-report is
// deliberately NOT in REAL_TASK_TYPES -- no service page, no Forge support,
// no client-facing submit path until that build is given the go-ahead.
export const BUSINESS_REPORT_USD = 5;

// Every image task returns 5 options to pick from, for one flat price.
export const IMAGE_OPTION_COUNT = 5;
