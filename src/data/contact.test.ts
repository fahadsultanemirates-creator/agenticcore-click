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
  SOCIAL_LINKS,
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
  assert.equal(WHATSAPP_PHONE, "18089985226");
  assert.match(SUPPORT_EMAIL, /^hello@agenticcore\.(agency|biz|click)$/);
});

test("the link uses the number, in the only form WhatsApp documents", () => {
  // wa.me/<number>, international format, no plus, no spaces, no leading
  // zero. The username form appears in no WhatsApp documentation, so it
  // is not what a stranger's phone is pointed at.
  assert.equal(whatsAppUrl(), `https://wa.me/${WHATSAPP_PHONE}`);
  assert.match(whatsAppUrl() as string, /^https:\/\/wa\.me\/[1-9]\d{7,14}$/);
  assert.ok(!(whatsAppUrl() as string).includes("+"), "a plus sign breaks a wa.me link");
  assert.ok(!/\s/.test(whatsAppUrl() as string), "whitespace breaks a wa.me link");
});

test("the number is the one the owner gave, not a placeholder", () => {
  // Pinned to the exact value, because this has now changed twice and
  // each time the old one stayed live somewhere. A shape check alone
  // would have passed both numbers.
  const d = WHATSAPP_PHONE as string;
  assert.equal(d, "18089985226");
  assert.equal(d.length, 11, `expected 1 + 10 digits, got ${d.length}`);
  assert.ok(d.startsWith("1"), "country code should be 1");
  assert.ok(!/^(\d)\1+$/.test(d.slice(1)), "looks like a repeated-digit placeholder");
});

test("what is displayed is what the link opens", () => {
  // A label saying one account while the button opens another is the
  // kind of thing nobody notices until a customer messages the wrong
  // place.
  const label = whatsAppLabel() as string;
  assert.equal(label.replace(/[^0-9]/g, ""), WHATSAPP_PHONE);
});

test("clearing the number falls back to the username, not to nothing", () => {
  const url = (phone: string | null, user: string | null) =>
    phone ? `https://wa.me/${phone}` : user ? `https://wa.me/${user}` : null;
  assert.equal(url(WHATSAPP_PHONE, WHATSAPP_USERNAME), "https://wa.me/18089985226");
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

// ---------------------------------------------------------------------
// The public accounts.
//
// All three sites post to the same six. They are asserted by exact URL
// rather than by shape: the two Facebook links that used to be here were
// both well-formed facebook.com URLs, and both were wrong.
// ---------------------------------------------------------------------

test("the six public accounts are exactly the ones the owner gave", () => {
  assert.deepEqual(
    SOCIAL_LINKS.map((s) => [s.key, s.href]),
    [
      ["x", "https://x.com/AgenticCoreHQ"],
      ["facebook", "https://www.facebook.com/people/AgenticCore/61593981579304/"],
      ["instagram", "https://www.instagram.com/agenticcore.agency"],
      ["youtube", "https://www.youtube.com/@AgenticcoreAgency"],
      ["tiktok", "https://www.tiktok.com/@agenticcore.agency"],
      ["telegram-channel", "https://t.me/agenticCoreHQ"],
    ],
  );
});

test("this site's own business email is the right one", () => {
  assert.equal(SUPPORT_EMAIL, "hello@agenticcore.click");
});

test("no Facebook share-link survives anywhere", () => {
  // /share/<id> links are opaque: you cannot tell by reading one whether
  // it points at the right Page, which is exactly how the three sites
  // drifted onto two different ones.
  const offenders: string[] = [];
  const scan = (name: string, body: string) => {
    for (const m of body.matchAll(/facebook\.com\/share\/[A-Za-z0-9]+/g)) {
      offenders.push(`${name} → ${m[0]}`);
    }
  };
  for (const file of FILES) {
    scan(file.replace(SRC, "src/").replace(FUNCTIONS, "supabase/functions"), readFileSync(file, "utf8"));
  }

  assert.deepEqual(offenders, []);
});

test("every account in the list is actually drawn in the footer", () => {
  // The footer maps key -> icon. A key with no icon is a hole in the
  // row; TypeScript catches it at build time and this catches it here,
  // where the failure names the missing account.
  const footer = readFileSync(new URL("../components/landing/Footer.tsx", import.meta.url).pathname, "utf8");
  const icons = footer.slice(footer.indexOf("const ICONS"), footer.indexOf("};", footer.indexOf("const ICONS")));
  assert.ok(icons.length > 0, "the footer no longer has an ICONS map — this test is stale");
  const missing = SOCIAL_LINKS.filter((s) => !new RegExp(`(^|\\s)"?${s.key}"?:`, "m").test(icons));
  assert.deepEqual(missing.map((s) => s.key), []);
});

test("no component writes a social URL by hand", () => {
  const hosts = /(facebook|instagram|tiktok)\.com|youtube\.com|x\.com\/Agentic/;
  const offenders: string[] = [];
  for (const file of FILES) {
    if (file.endsWith("/data/contact.ts")) continue;
    const body = code(readFileSync(file, "utf8"));
    if (hosts.test(body)) {
      offenders.push(file.replace(SRC, "src/").replace(FUNCTIONS, "supabase/functions"));
    }
  }
  assert.deepEqual(offenders, []);
});

test("the ordering bot is linked here, and is not a social account", () => {
  // .click is the only site with a public ordering bot.
  const linked = FILES.some((f) => readFileSync(f, "utf8").includes(ORDER_BOT));
  assert.ok(linked, "the ordering bot is not linked anywhere on .click");
  assert.ok(
    !SOCIAL_LINKS.some((s) => s.href.includes(ORDER_BOT)),
    "the ordering bot is listed as a social account",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
