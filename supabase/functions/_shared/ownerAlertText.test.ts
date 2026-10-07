// Run with: node --experimental-strip-types supabase/functions/_shared/ownerAlerts.test.ts

import assert from 'node:assert/strict';
import { formatBrief } from './ownerAlertText.ts';

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

test('a brief reads as labelled lines, not as JSON', () => {
  const text = formatBrief({ businessName: 'Pixel & Pine', logoChoice: 'generate' });
  assert.ok(text.includes('Business Name: Pixel & Pine'), text);
  assert.ok(text.includes('Logo Choice: generate'), text);
  assert.ok(!text.includes('{'), 'leaked JSON braces');
});

// An intake form sends every field it has, most of them blank. Twenty
// "Colors:" lines with nothing after them is an alert nobody reads.
test('empty fields are left out entirely', () => {
  const text = formatBrief({
    businessName: 'Acme',
    colors: '',
    notes: null,
    instagram: undefined,
    whatsapp: '   ',
  });
  assert.equal(text, 'Business Name: Acme');
});

test('the plumbing fields are not shown', () => {
  const text = formatBrief({ sku: 30, tier: 'small', subtype: 'logo', businessName: 'Acme' });
  assert.equal(text, 'Business Name: Acme');
});

// The short facts are what you read at a glance; a three-paragraph brief
// in the middle pushes them off a phone screen.
test('long free text sorts below the short facts', () => {
  const text = formatBrief({
    description: 'A very long description that goes on and on about the business',
    businessName: 'Acme',
    category: 'Retail',
  });
  const lines = text.split('\n');
  assert.equal(lines[lines.length - 1].startsWith('Description:'), true, text);
  assert.ok(lines[0].startsWith('Business Name:') || lines[0].startsWith('Category:'), text);
});

test('a list comes out readable, not as [object Object]', () => {
  const text = formatBrief({ sections: ['About', 'Services', 'Contact'] });
  assert.equal(text, 'Sections: About, Services, Contact');
});

test('a numeric field survives', () => {
  const text = formatBrief({ pages: 5, optionCount: 1 });
  assert.ok(text.includes('Pages: 5'), text);
  assert.ok(text.includes('Option Count: 1'), text);
});

// A task with nothing in its payload still has to produce an alert that
// says so, rather than an empty message the owner cannot interpret.
test('an empty brief says so out loud', () => {
  assert.equal(formatBrief({}), '(no details given)');
  assert.equal(formatBrief({ sku: 10 }), '(no details given)');
});

test('the literal string "undefined" is treated as absent', () => {
  assert.equal(formatBrief({ businessName: 'Acme', colors: 'undefined' }), 'Business Name: Acme');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
