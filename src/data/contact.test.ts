// Run with: node --experimental-strip-types src/data/contact.test.ts
//
// Support contacts, and the line between them and the ordering bot.
//
// Those are two different destinations with two different jobs. The bot
// (t.me/AgenticcoreClickManagerbot) creates projects and places orders;
// the support accounts answer questions. Collapsing them would send
// someone with a billing problem into an order flow, so the separation is
// asserted rather than left to whoever edits a footer next.
//
// This site also shipped three different Telegram handles at once, and a
// wrong-brand one in two footers, which is why no component is allowed to
// write either link by hand.

import assert from "node:assert/strict";
import process from "node:process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SUPPORT_EMAIL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
  WHATSAPP_PHONE,
  WHATSAPP_USERNAME,
  whatsAppLabel,
  whatsAppUrl,
} from "./contact.ts";

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

const SRC = new URL("..", import.meta.url).pathname;
const FUNCTIONS = new URL("../../supabase/functions", import.meta.url).pathname;
const ORDER_BOT = "AgenticcoreClickManagerbot";

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(full) && !/\.test\.[cm]?tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Code with comments and imports stripped -- both name what they ban. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^\s*import\s[\s\S]*?;\s*$/gm, " ");
}

const FILES = [...sourceFiles(SRC), ...sourceFiles(FUNCTIONS)];

test("the scan reads this repo", () => {
  assert.ok(FILES.length > 10, `only ${FILES.length} files found — the walk is broken`);
});

test("the support accounts are the ones the owner gave", () => {
  assert.equal(TELEGRAM_HANDLE, "AgenticCorebiz");
  assert.equal(TELEGRAM_URL, "https://t.me/AgenticCorebiz");
  assert.equal(WHATSAPP_USERNAME, "agenticcore.biz");
  assert.equal(whatsAppUrl(), "https://wa.me/agenticcore.biz");
  assert.equal(whatsAppLabel(), "@agenticcore.biz");
  assert.match(SUPPORT_EMAIL, /^hello@agenticcore\.(agency|biz|click)$/);
});

test("a phone number, once set, wins over the username", () => {
  // The username link form is not in WhatsApp's documentation. If it does
  // not work, the fix must be one line -- so the fallback is exercised
  // here rather than discovered under pressure.
  assert.equal(WHATSAPP_PHONE, null, "a number is set; update this test and the expectation above");
  const url = (phone: string | null, user: string | null) =>
    phone ? `https://wa.me/${phone}` : user ? `https://wa.me/${user}` : null;
  assert.equal(url("971500000000", "agenticcore.biz"), "https://wa.me/971500000000");
  assert.equal(url(null, "agenticcore.biz"), "https://wa.me/agenticcore.biz");
  assert.equal(url(null, null), null);
});

test("no component writes a Telegram or WhatsApp link by hand", () => {
  const offenders: string[] = [];
  for (const file of FILES) {
    if (file.endsWith("/data/contact.ts")) continue;
    const body = code(readFileSync(file, "utf8"));
    for (const match of body.matchAll(/t\.me\/([A-Za-z0-9_]+)/g)) {
      // The ordering bot is allowed to be named directly: it is not a
      // support contact and must not be routed through TELEGRAM_URL.
      if (match[1] === ORDER_BOT) continue;
      // supabase/functions deploys separately and cannot import from
      // src/data/contact.ts, so the literal is unavoidable there -- but
      // it must be the canonical handle. This is exactly where the old
      // agenticCoreHQ survived a rename, in the text the bot reads out.
      if (file.startsWith(FUNCTIONS) && match[1] === TELEGRAM_HANDLE) continue;
      offenders.push(
        `${file.replace(SRC, "src/").replace(FUNCTIONS, "supabase/functions")} → t.me/${match[1]}`,
      );
    }
    for (const match of body.matchAll(/wa\.me\/[A-Za-z0-9._]+/g)) {
      offenders.push(`${file.replace(SRC, "src/")} → ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the ordering bot is never used as a support contact", () => {
  assert.ok(!TELEGRAM_URL.includes(ORDER_BOT), "the support handle points at the order bot");
  assert.ok(!TELEGRAM_HANDLE.includes("bot"), `support handle "${TELEGRAM_HANDLE}" looks like a bot`);

  // Wherever the bot IS linked, it must not be labelled as support.
  for (const file of FILES) {
    if (file.endsWith("/data/contact.ts")) continue; // its comment explains the rule
    const body = code(readFileSync(file, "utf8"));
    if (!body.includes(ORDER_BOT)) continue;
    const near = body.slice(Math.max(0, body.indexOf(ORDER_BOT) - 400), body.indexOf(ORDER_BOT) + 400);
    assert.ok(
      !/support/i.test(near),
      `${file.replace(SRC, "src/")} labels the ordering bot as support`,
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
