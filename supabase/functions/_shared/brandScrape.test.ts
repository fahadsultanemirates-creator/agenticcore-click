// Tests for scraping a site's stated contact details. Run with:
//   node --experimental-strip-types supabase/functions/_shared/brandScrape.test.ts
//
// Only scrapeHtml is exercised, which is pure string work over whatever HTML a
// client's site happens to serve. It is worth testing because the failure mode
// is a wrong fact printed on a finished deliverable -- an invented address on
// a letterhead is worse than no address at all.

import assert from 'node:assert/strict';
import { scrapeHtml } from './brandScrape.ts';

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

const BASE = 'https://example.com';

test('reads phone and address from schema.org markup', () => {
  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"LocalBusiness","name":"Nadia Interiors",
     "telephone":"+971 4 555 0199","email":"hello@nadia.ae",
     "address":{"@type":"PostalAddress","streetAddress":"Unit 12, Al Quoz 3",
                "addressLocality":"Dubai","addressCountry":"UAE"}}
  </script></head><body></body></html>`;
  const { contact } = scrapeHtml(html, BASE);
  assert.equal(contact?.phone, '+971 4 555 0199');
  assert.equal(contact?.email, 'hello@nadia.ae');
  assert.equal(contact?.address, 'Unit 12, Al Quoz 3, Dubai, UAE');
});

// Real pages often wrap everything in @graph, or ship several blocks.
test('finds the business inside an @graph', () => {
  const html = `<script type="application/ld+json">
    {"@graph":[{"@type":"WebSite","name":"Site"},
               {"@type":"Organization","telephone":"+44 20 7946 0000",
                "address":{"streetAddress":"5 Hanover Square","addressLocality":"London","postalCode":"W1S 1HQ"}}]}
  </script>`;
  const { contact } = scrapeHtml(html, BASE);
  assert.equal(contact?.phone, '+44 20 7946 0000');
  assert.equal(contact?.address, '5 Hanover Square, London, W1S 1HQ');
});

test('one malformed block does not lose a later good one', () => {
  const html = `<script type="application/ld+json">{ this is not json }</script>
    <script type="application/ld+json">{"@type":"Organization","telephone":"+1 808 555 0100"}</script>`;
  assert.equal(scrapeHtml(html, BASE).contact?.phone, '+1 808 555 0100');
});

test('falls back to the <address> element', () => {
  const html = `<body><address>221B Baker Street<br>London<br>NW1 6XE</address></body>`;
  assert.equal(scrapeHtml(html, BASE).contact?.address, '221B Baker Street, London, NW1 6XE');
});

test('falls back to tel: and mailto: links', () => {
  const html = `<a href="tel:+92 300 1234567">call</a><a href="mailto:hi@shop.pk">mail</a>`;
  const { contact } = scrapeHtml(html, BASE);
  assert.equal(contact?.phone, '+92 300 1234567');
  assert.equal(contact?.email, 'hi@shop.pk');
});

// The case that prompted this: a site with an email, a WhatsApp link and
// socials, but no address and no phone anywhere. What is absent must stay
// absent -- never a placeholder, never a guess.
test('a site with no address or phone reports neither', () => {
  const html = `<html><head><title>AgenticCore Agency</title></head><body>
    <a href="mailto:hello@agenticcore.agency">email</a>
    <a href="https://wa.me/18089985226">whatsapp</a>
    <a href="https://instagram.com/agenticcore.agency">ig</a>
  </body></html>`;
  const { contact } = scrapeHtml(html, BASE);
  assert.equal(contact?.email, 'hello@agenticcore.agency');
  assert.equal(contact?.phone, undefined, 'must not invent a phone number');
  assert.equal(contact?.address, undefined, 'must not invent an address');
  assert.ok(contact?.whatsapp?.includes('wa.me'));
});

test('a site with no contact details at all reports none', () => {
  assert.equal(scrapeHtml('<html><body><h1>Hello</h1></body></html>', BASE).contact, undefined);
});

// An empty PostalAddress must not become an empty string that then prints as a
// blank line on the deliverable.
test('an empty address block is treated as absent', () => {
  const html = `<script type="application/ld+json">
    {"@type":"Organization","address":{"@type":"PostalAddress","streetAddress":"  "}}</script>`;
  assert.equal(scrapeHtml(html, BASE).contact, undefined);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
