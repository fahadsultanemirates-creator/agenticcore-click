// Run with: node --experimental-strip-types <this file>
//
// AC token payment was removed from every site. This keeps it removed.
//
// It was not one switch: a contract address, a 15% discount constant, a
// discounted-deposit function, a panel in the dashboard and a block on the
// payment screen, each in a different file. Anything that reintroduces one
// of those pieces fails here.
//
// USDT is untouched and must stay: a test that just banned the word
// "token" would also ban "raw token units", which is how the USDT chain
// watcher describes an ERC-20 amount.

import assert from "node:assert/strict";
import process from "node:process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${(error as Error).message.split("\n")[0]}`);
  }
}

const ROOT = new URL("../..", import.meta.url).pathname;
const SKIP = new Set(["node_modules", "dist", ".git", ".netlify"]);
const EXTS = /\.(ts|tsx|js|jsx|mjs|css|html|json|sql)$/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (EXTS.test(full) && !full.endsWith("acToken.test.ts")) out.push(full);
  }
  return out;
}

/** Code with comments removed -- this repo's own notes record the removal. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*--.*$/gm, " ");
}

const FILES = sourceFiles(ROOT);

test("the scan actually reads this repo", () => {
  assert.ok(FILES.length > 20, `only found ${FILES.length} source files — the walk is broken`);
});

test("the AC token contract address appears nowhere", () => {
  // Unambiguous: this string has no innocent use, so it is checked in
  // comments too.
  const CONTRACT = "0xe9568888a0bc317519957047cf736e134B097768".toLowerCase();
  const hits = FILES.filter((f) => readFileSync(f, "utf8").toLowerCase().includes(CONTRACT));
  assert.deepEqual(hits.map((f) => f.replace(ROOT, "")), []);
});

test("no AC token identifiers survive in code", () => {
  const banned = [/AC_TOKEN/, /AcToken/, /upfrontDueInAc/, /dueInAc/, /actoken\.org/i];
  const hits: string[] = [];
  for (const file of FILES) {
    const body = code(readFileSync(file, "utf8"));
    for (const pattern of banned) {
      if (pattern.test(body)) hits.push(`${file.replace(ROOT, "")} → ${pattern}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("no customer-facing text offers payment in AC", () => {
  const banned = [/pay (?:in|with) AC\b/i, /AC token/i, /token discount/i];
  const hits: string[] = [];
  // Test files are excluded from THIS check only. Another guard in this
  // repo lists "ac token" as a phrase its own pages must not contain, and
  // a scan that flags one guard for containing the string the other guard
  // bans is checking itself, not the product. The identifier and contract
  // checks above still cover every file.
  for (const file of FILES.filter((f) => !/\.test\.[cm]?tsx?$/.test(f))) {
    const body = code(readFileSync(file, "utf8"));
    for (const pattern of banned) {
      if (pattern.test(body)) hits.push(`${file.replace(ROOT, "")} → ${pattern}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("USDT is still here, so this is not passing by deleting payment", () => {
  const usdt = FILES.filter((f) => /0x62Ad7D55fbc8A8591109D72b67Ec63aa1EE196bC/i.test(readFileSync(f, "utf8")));
  assert.ok(usdt.length > 0, "the USDT receiving address is gone — that is not what was asked for");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
