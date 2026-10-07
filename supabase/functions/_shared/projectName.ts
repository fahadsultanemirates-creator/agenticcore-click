// What to call a project nobody has named.
//
// Most orders will never be given a name: a client taps Logo, types a
// brief, and pays. The project still needs one, and "Untitled project"
// three times over is a list you cannot read. The brief is the best
// name available -- it is what they wrote -- trimmed to a label.
//
// Pure, and tested, because this runs on the charge path: a name that
// throws on a payload shape nobody anticipated would lose an order that
// has already been paid for.

/** Long enough to tell two projects apart, short enough to be a heading. */
export const MAX_NAME_LENGTH = 60;

/** Payload keys that might carry a real name, best first. */
const NAME_KEYS = ['projectName', 'businessName', 'company'] as const;

/** Payload keys that carry what they asked for, best first. */
const BRIEF_KEYS = ['description', 'brief', 'topic', 'notes'] as const;

function firstString(payload: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

/** One line: no newlines, no runs of spaces, cut on a word where it can. */
function toLabel(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_NAME_LENGTH) return flat;

  const cut = flat.slice(0, MAX_NAME_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  // Only break on a word when the word is near the end; otherwise a single
  // very long token would cut the name down to almost nothing.
  const body = lastSpace > MAX_NAME_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,.;:–-]+$/, '')}…`;
}

export function projectNameFrom(productName: string, payload: Record<string, unknown>): string {
  const named = firstString(payload, NAME_KEYS);
  if (named) return toLabel(named);

  const brief = firstString(payload, BRIEF_KEYS);
  if (brief) return toLabel(brief);

  return productName || 'New project';
}
