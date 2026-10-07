// Run with: node --experimental-strip-types src/lib/share.test.ts

import assert from "node:assert/strict";
import { shareMessage } from "./share.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

const A = "https://x.supabase.co/storage/v1/object/public/deliverables/a.jpg";
const B = "https://x.supabase.co/storage/v1/object/public/deliverables/b.jpg";

test("one file is its title and its link, nothing else", () => {
  assert.equal(shareMessage({ title: "Logo — AC-1002-01", urls: [A] }), `Logo — AC-1002-01\n${A}`);
});

// Five bare URLs with no idea what they are is not a message anybody can
// answer. Numbering them is what makes "I like 3" possible.
test("several files are numbered under a counted heading", () => {
  const text = shareMessage({ title: "Logo — AC-1002-01", urls: [A, B] });
  assert.match(text, /2 options:/);
  assert.match(text, /^1\. /m);
  assert.match(text, /^2\. /m);
});

test("no files is still a sentence, not an empty string", () => {
  assert.equal(shareMessage({ title: "Noor Bakery", urls: [] }), "Noor Bakery");
});

test("every link survives into the message", () => {
  const text = shareMessage({ title: "t", urls: [A, B] });
  assert.ok(text.includes(A) && text.includes(B));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
