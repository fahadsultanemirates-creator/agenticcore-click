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

export type VideoAspect = '16:9' | '9:16';

/**
 * Landscape unless the order actually asks for vertical.
 *
 * A business intro somebody plays on a laptop is landscape; guessing
 * otherwise wastes half the frame. Reels and stories have to ask.
 *
 * This replaced a pixel-dimension helper that existed because HeyGen wanted
 * width and height. grok-imagine-video takes the ratio as a string, so the
 * arithmetic that used to sit here -- and once shipped a clip transposed
 * into 720x1280 with white bands down both sides -- has nothing left to get
 * wrong.
 */
export function aspectFor(payload: Record<string, unknown>): VideoAspect {
  return payload.aspect === '9:16' || payload.orientation === 'portrait' ? '9:16' : '16:9';
}

/**
 * A resolution named in ordinary words.
 *
 * Telegram orders arrive as one line of free text with no structured fields,
 * so "make it 1080p" or "in HD" is the only way to ask for a quality from
 * there. The website form has a picker; this is the same choice for everyone
 * else.
 */
