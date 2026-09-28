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
//   - object keys sorted, by code unit
//   - no whitespace between tokens
//   - UTF-8, with no HTML escaping: & stays &, never &amp;
//
// The string is built here rather than by handing a key-sorted object to
// JSON.stringify, which is what the first version did and which does not
// work. JavaScript objects keep integer-like keys in ascending NUMERIC
// order ahead of every string key, whatever order they were inserted in,
// so {"10":…,"9":…} came back out as {"9":…,"10":…} -- numerically sorted,
// not lexicographically, and not what this file said it did. Grok Bot
// caught it by differential-testing their verifier against ours.
//
// It cost nothing at the time: no notice payload has a numeric key. It
// would have cost a great deal the first time one did, because the symptom
// is a signature mismatch with two implementations that both look correct.

export function canonicalJson(value: unknown): string {
  return serialise(value);
}

function serialise(value: unknown): string {
  // Dates and anything else with toJSON are resolved first, exactly as
  // JSON.stringify would, so a Date becomes its ISO string rather than the
  // empty object its own key list would produce.
  const resolved =
    value !== null && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function'
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;

  if (Array.isArray(resolved)) {
    // Array order is data. Sorting it would change what it means.
    // undefined is not representable, and JSON.stringify writes null in an
    // array position; match that rather than dropping the element and
    // shifting every index after it.
    return '[' + resolved.map((item) => (item === undefined ? 'null' : serialise(item))) .join(',') + ']';
  }

  if (resolved !== null && typeof resolved === 'object') {
    const obj = resolved as Record<string, unknown>;
    const body = Object.keys(obj)
      .sort()
      // undefined is dropped by JSON.stringify, so the key list has to match
      // what actually gets serialised or the two sides disagree about which
      // keys exist.
      .filter((key) => obj[key] !== undefined)
      .map((key) => JSON.stringify(key) + ':' + serialise(obj[key]))
      .join(',');
    return '{' + body + '}';
  }

  // Primitives, via JSON.stringify so string escaping stays exactly the
  // standard's. It returns undefined for a function or a bare undefined,
  // neither of which belongs in a payload; null keeps the output valid
  // rather than splicing the word "undefined" into the signed string.
  const primitive = JSON.stringify(resolved);
  return primitive === undefined ? 'null' : primitive;
}
