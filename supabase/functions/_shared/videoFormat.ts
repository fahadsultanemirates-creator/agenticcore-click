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
  const height = payload.resolution === '1080p' ? 1080 : 720;

  return wantsPortrait ? portrait(height) : landscape(height);
}
