// One agreed spelling of a JSON value, so two machines can sign the same
// bytes.
//
// A signature is over a string, not an object, so both sides have to
// produce byte-identical text from the same data. Ordinary JSON.stringify
// does not guarantee that: key order follows insertion order, so the same
// object built two ways serialises two ways, and the signatures differ for
// no reason anybody can see from the payload.
//
// The rules, matching what Grok Bot verifies against:
//   - object keys sorted
//   - no whitespace between tokens
//   - UTF-8, with no HTML escaping: & stays &, never &amp;
//
// JavaScript's JSON.stringify already gives the last two. Key order is the
// part that needs doing.

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);

  // Order matters only for plain objects. Dates, null and primitives are
  // left to JSON.stringify's own rules so this cannot change what a value
  // means, only how its keys are ordered.
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const inner = (value as Record<string, unknown>)[key];
      // undefined is dropped by JSON.stringify anyway; skipping it here
      // keeps the key list identical to what actually gets serialised.
      if (inner !== undefined) sorted[key] = sortKeys(inner);
    }
    return sorted;
  }

  return value;
}
