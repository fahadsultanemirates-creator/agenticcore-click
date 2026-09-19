// The canvas a video is rendered onto.
//
// This was one transposed line and it shaped every short clip we will ever
// sell. "720p" became { width: 720, height: 1280 } -- the 16:9 ratio applied
// to the wrong side -- so a landscape avatar was letterboxed into a tall
// portrait frame with white bands above and below it. The render was
// correct; the canvas we asked for was not.
//
// It survived because nothing disagreed with it out loud. Long videos
// returned 1920x1080 and short ones returned a portrait frame, and a product
// catalog where two video products disagree about which way up a video goes
// is the kind of thing only a person watching one notices.
//
// Pure and tested for that reason: a resolution is a fact about a rectangle,
// and rectangles are exactly what a test can hold still.

export interface VideoDimension {
  width: number;
  height: number;
}

/** 16:9 landscape at a given height. 720 -> 1280x720, 1080 -> 1920x1080. */
export function landscape(height: number): VideoDimension {
  return { width: Math.round((height * 16) / 9), height };
}

/** 9:16 portrait at a given width -- reels, stories, TikTok. */
export function portrait(width: number): VideoDimension {
  return { width, height: Math.round((width * 16) / 9) };
}

export function dimensionFor(payload: Record<string, unknown>): VideoDimension {
  // Vertical only when the order actually asks for it. A business intro that
  // somebody plays on a laptop is landscape; guessing otherwise wastes half
  // the frame.
  const wantsPortrait = payload.aspect === '9:16' || payload.orientation === 'portrait';

  // What the order asked for wins; otherwise 1080p, whatever the length.
  //
  // Short clips used to default to 720p on the reasoning that they are bound
  // for a feed. That had it backwards: the fifteen second clip is the one
  // doing the selling, and it is the first thing a prospective client ever
  // sees. Standard generation is billed by the minute rather than by the
  // pixel, so the cheaper-looking option was not buying anything.
  //
  // 720p remains available, and an order that names it still gets it.
  const asked =
    payload.resolution === '1080p' ? 1080 : payload.resolution === '720p' ? 720 : null;
  const height = asked ?? 1080;

  return wantsPortrait ? portrait(height) : landscape(height);
}

/**
 * A resolution named in ordinary words.
 *
 * Telegram orders arrive as one line of free text with no structured fields,
 * so "make it 1080p" or "in HD" is the only way to ask for a quality from
 * there. The website form has a picker; this is the same choice for everyone
 * else.
 */
export function resolutionIn(text: string): '720p' | '1080p' | null {
  const haystack = text.toLowerCase();
  if (/\b(1080p?|full\s*hd|fhd|high\s*quality|best\s*quality)\b/.test(haystack)) return '1080p';
  if (/\b(720p?|hd\s*ready|standard\s*quality|lower\s*quality)\b/.test(haystack)) return '720p';
  return null;
}
