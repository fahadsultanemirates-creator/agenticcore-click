// Run with: node --experimental-strip-types supabase/functions/_shared/sitePages.test.ts

import assert from 'node:assert/strict';
import { safePageName, splitPages } from './sitePages.ts';

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

const fence = (html: string) => '```html\n' + html + '\n```';

test('several marked pages come out in order, index first', () => {
  const reply = [
    'Here you go.',
    'FILE: about.html',
    fence('<h1>About</h1>'),
    'FILE: index.html',
    fence('<h1>Home</h1>')
  ].join('\n\n');
  const pages = splitPages(reply);
  assert.deepEqual(pages.map((p) => p.name), ['index.html', 'about.html']);
  assert.equal(pages[0].html, '<h1>Home</h1>');
});

// Models write prose between blocks. Parsing by position breaks on it.
test('prose between the blocks does not break the pairing', () => {
  const reply = [
    'FILE: index.html',
    'Here is the home page, with a hero and a nav.',
    fence('<h1>Home</h1>'),
    'And now the contact page:',
    'FILE: contact.html',
    fence('<h1>Contact</h1>')
  ].join('\n\n');
  assert.deepEqual(splitPages(reply).map((p) => p.name), ['index.html', 'contact.html']);
});

// A one-page site is a legitimate small-tier order, and older prompts had
// no reason to use markers at all.
test('an unmarked single block is still a site', () => {
  const pages = splitPages('Sure!\n\n' + fence('<h1>Only</h1>'));
  assert.deepEqual(pages, [{ name: 'index.html', html: '<h1>Only</h1>' }]);
});

test('a bare document with no fence at all still works', () => {
  const pages = splitPages('<!doctype html><h1>Raw</h1>');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].name, 'index.html');
});

// A site with no index.html serves nothing at its own address.
test('a site without index.html gets one', () => {
  const reply = ['FILE: home.html', fence('<h1>Home</h1>'), 'FILE: about.html', fence('<h1>About</h1>')].join('\n\n');
  const pages = splitPages(reply);
  assert.equal(pages[0].name, 'index.html');
  assert.equal(pages[0].html, '<h1>Home</h1>');
  assert.equal(pages.length, 2);
});

test('an empty reply produces no pages rather than an empty site', () => {
  assert.deepEqual(splitPages(''), []);
  assert.deepEqual(splitPages('```html\n\n```'), []);
});

test('the same filename twice keeps the first', () => {
  const reply = ['FILE: index.html', fence('<h1>First</h1>'), 'FILE: index.html', fence('<h1>Second</h1>')].join('\n\n');
  const pages = splitPages(reply);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].html, '<h1>First</h1>');
});

// ---- filenames --------------------------------------------------------

test('an extension is added when the model omits it', () => {
  assert.equal(safePageName('about'), 'about.html');
  assert.equal(safePageName('about.html'), 'about.html');
  assert.equal(safePageName('About.HTML'), 'about.html');
});

// A name with a path in it would deploy outside the site root.
test('a path escape is refused', () => {
  assert.equal(safePageName('../secrets'), null);
  assert.equal(safePageName('/etc/passwd'), null);
  assert.equal(safePageName('a/b.html'), null);
  assert.equal(safePageName('..'), null);
});

// A space breaks the links the other pages use to reach it.
test('a name that would break its own links is refused', () => {
  assert.equal(safePageName('about us.html'), null);
  assert.equal(safePageName(''), null);
  assert.equal(safePageName('   '), null);
  assert.equal(safePageName('x'.repeat(80)), null);
});

test('quotes around a name are stripped', () => {
  assert.equal(safePageName('"about.html"'), 'about.html');
  assert.equal(safePageName("'contact'"), 'contact.html');
});

test('a page with an unusable name is dropped, not deployed somewhere odd', () => {
  const reply = ['FILE: ../evil.html', fence('<h1>No</h1>'), 'FILE: index.html', fence('<h1>Yes</h1>')].join('\n\n');
  const pages = splitPages(reply);
  assert.deepEqual(pages.map((p) => p.name), ['index.html']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
