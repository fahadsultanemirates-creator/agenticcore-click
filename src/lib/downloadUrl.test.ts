// Run with: node --experimental-strip-types src/lib/downloadUrl.test.ts

import assert from "node:assert/strict";
import { deliverableFilename, extensionOf, forcedDownloadUrl } from "./downloadUrl.ts";

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

const STORED =
  "https://vuutmxrunxkjydcryeoa.supabase.co/storage/v1/object/public/deliverables/e4967e94/1791395333770-photo-AgACAgE.jpg";

test("a stored deliverable becomes a real download with a chosen name", () => {
  const url = forcedDownloadUrl(STORED, "AC-1002-01-option-1.jpg");
  assert.equal(url, `${STORED}?download=AC-1002-01-option-1.jpg`);
});

test("an existing query string is appended to, not clobbered", () => {
  const url = forcedDownloadUrl(`${STORED}?t=1`, "a.jpg");
  assert.equal(url, `${STORED}?t=1&download=a.jpg`);
});

test("the filename is encoded, so a space cannot break the url", () => {
  assert.match(forcedDownloadUrl(STORED, "my logo.jpg")!, /download=my%20logo\.jpg/);
});

// An owner-delivered link can point anywhere. Saying so is the point:
// the caller labels the button "Open" instead of lying about downloading.
test("a link we do not host cannot be forced, and says so", () => {
  assert.equal(forcedDownloadUrl("https://example.com/logo.png", "a.png"), null);
  assert.equal(forcedDownloadUrl("https://drive.google.com/file/d/abc/view", "a"), null);
});

test("the extension survives a query string and a fragment", () => {
  assert.equal(extensionOf("https://x/a.PNG?token=1"), ".png");
  assert.equal(extensionOf("https://x/a.zip#frag"), ".zip");
  assert.equal(extensionOf("https://x/nodot"), "");
  assert.equal(extensionOf("https://x/.hidden"), "");
});

test("one file is named for its order, several are numbered", () => {
  assert.equal(deliverableFilename("AC-1002-01", 1, STORED, 1), "AC-1002-01.jpg");
  assert.equal(deliverableFilename("AC-1002-01", 3, STORED, 5), "AC-1002-01-option-3.jpg");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
