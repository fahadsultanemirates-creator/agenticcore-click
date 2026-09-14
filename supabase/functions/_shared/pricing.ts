// Server-side pricing, the single source of truth for every task price.
// Mirrors what's shown in each service page's UI (see ServicePageHeader's
// `price` prop on each src/pages/services/*.tsx and src/pages/WebsiteIntake.tsx)
// -- kept in sync by hand since the frontend is a static SPA with no shared
// build step with these functions. Returns null for a payload that doesn't
// map to a real price (invalid/incomplete selection), which the caller must
// reject rather than guess a default.
//
// Extracted out of submit-task so forge-submit can reuse the exact same
// logic instead of a second copy that could drift.
export function calculatePriceUsd(type: string, payload: Record<string, unknown>): number | null {
  switch (type) {
    case 'website':
      if (payload.tier === 'small') return 49;
      if (payload.tier === 'large') return 99;
      return null;

    case 'pdf':
      return 15;

    case 'social':
      return 18;

    case 'documents':
      return 10;

    case 'brand-kit':
      return 10;

    case 'image':
      return 8;

    case 'video': {
      const length = payload.length;
      const avatarStyle = payload.avatarStyle as string | undefined;
      const resolution = payload.resolution as string | undefined;
      const noAvatarMode = payload.noAvatarMode as string | undefined;

      if (length === 'short') {
        if (avatarStyle === 'none') {
          if (noAvatarMode === 'full') return 10;
          if (noAvatarMode === 'hybrid') return 25;
          return null;
        }
        const shortPrices: Record<string, Record<string, number>> = {
          standard: { '720p': 15, '1080p': 20 },
          premium: { '720p': 30, '1080p': 40 },
          elite: { '720p': 55, '1080p': 70 }
        };
        if (!avatarStyle || !resolution) return null;
        return shortPrices[avatarStyle]?.[resolution] ?? null;
      }

      if (length === 'long') {
        if (avatarStyle === 'none') return 50;
        const longPrices: Record<string, number> = { standard: 60, premium: 120, elite: 200 };
        if (!avatarStyle) return null;
        return longPrices[avatarStyle] ?? null;
      }

      return null;
    }

    default:
      return null;
  }
}

export const REAL_TASK_TYPES = new Set(['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit']);

export const FULL_BUSINESS_SETUP_USD = 20;
