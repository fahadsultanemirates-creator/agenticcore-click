/**
 * The privacy page claims nothing on the site loads from a third party.
 *
 * That claim was false for months: index.html pulled Fraunces and Inter from
 * fonts.googleapis.com, so every visitor's IP reached Google before the page
 * painted, and the privacy page named Supabase, Netlify, Anthropic, xAI and
 * PDFShift but not Google. The fonts are self-hosted now -- and a claim like
 * that is exactly the kind that goes quietly stale, so it is checked.
 *
 * Scope matters here, and the first version of this script got it wrong. It
 * flagged every URL string anywhere in the build, which meant the footer's
 * social profile links, React's error-message links and a "yourbusiness.com"
 * placeholder all counted as privacy leaks. They are not: a link is fetched
 * only if someone clicks it. The claim is about what the browser fetches
 * *because the page was opened*.
 *
 * So this looks only at load-triggering references: stylesheets, preloads,
 * preconnects, scripts and images in the HTML, and url()/@import in the CSS.
 * A script that injects a request at runtime is out of reach of any static
 * check -- the browser run in verification is the backstop for that.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;

/** Hosts the privacy page already names, plus our own. */
const ALLOWED = ["agenticcore.click", "agenticcore.group", "supabase.co", "supabase.in"];

function filesIn(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesIn(full, out);
    else if (/\.(html|css)$/.test(full)) out.push(full);
  }
  return out;
}

/** Every external URL that opening this file would cause the browser to fetch. */
function loadedUrls(file, text) {
  const found = [];

  if (file.endsWith(".html")) {
    // <link rel="stylesheet|preload|preconnect|dns-prefetch|modulepreload" href="...">
    for (const tag of text.matchAll(/<link\b[^>]*>/gi)) {
      const rel = /rel="([^"]*)"/i.exec(tag[0])?.[1] ?? "";
      if (!/stylesheet|preload|preconnect|dns-prefetch|modulepreload/i.test(rel)) continue;
      const href = /href="([^"]*)"/i.exec(tag[0])?.[1];
      if (href) found.push(href);
    }
    // src= on script, img, iframe, video, audio, source, embed
    for (const tag of text.matchAll(
      /<(?:script|img|iframe|video|audio|source|embed)\b[^>]*>/gi,
    )) {
      const src = /\bsrc="([^"]*)"/i.exec(tag[0])?.[1];
      if (src) found.push(src);
      const srcset = /\bsrcset="([^"]*)"/i.exec(tag[0])?.[1];
      if (srcset) found.push(...srcset.split(",").map((part) => part.trim().split(/\s+/)[0]));
    }
  } else {
    for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)/gi)) found.push(m[1]);
    for (const m of text.matchAll(/@import\s+['"]([^'"]+)/gi)) found.push(m[1]);
  }

  return found.filter((url) => /^(https?:)?\/\//i.test(url));
}

const offenders = [];
for (const file of filesIn(DIST)) {
  const relative = file.replace(DIST, "");
  for (const url of loadedUrls(file, readFileSync(file, "utf8"))) {
    const host = (url.match(/^(?:https?:)?\/\/([a-z0-9.-]+)/i)?.[1] ?? "").toLowerCase();
    if (!host) continue;
    if (ALLOWED.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) continue;
    offenders.push(`${host}  (loaded by ${relative})`);
  }
}

const unique = [...new Set(offenders)];

if (unique.length > 0) {
  console.error(
    "check-no-third-party-assets: the privacy page says nothing loads from a third\n" +
      "party, but opening the site fetches from:\n",
  );
  for (const line of unique) console.error(`  ${line}`);
  console.error("\nEither self-host it, or name it on the privacy page AND in ALLOWED here.");
  process.exit(1);
}

console.log("check-no-third-party-assets: clean — nothing on page load fetches from a third party");
