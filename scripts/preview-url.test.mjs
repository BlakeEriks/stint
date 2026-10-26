import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewUrl } from './preview-url.mjs';

test("a branch's preview is Vercel's alias, lowercased, anything else a hyphen", () => {
  assert.equal(
    previewUrl('f462-Mobile_timer'),
    'https://stint-git-f462-mobile-timer-blakeeriks-projects.vercel.app',
  );
});

test('a branch whose alias passes 63 characters has none', () => {
  // Vercel truncates and hashes it, so no link beats a wrong one.
  assert.equal(previewUrl('a'.repeat(34)), null);
  assert.ok(previewUrl('a'.repeat(33)));
});
