#!/usr/bin/env node
/**
 * A branch's Vercel preview, by Vercel's branch alias.
 *
 *   node scripts/preview-url.mjs <branch>
 *
 * Prints the URL, or exits 1 when the branch is too long to have one.
 * `preview-db.yml`, `mobile-preview.yml` and `pnpm try-mac` all ask here.
 */
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

/** Null past 63 characters, where Vercel truncates and hashes the alias. */
export function previewUrl(branch) {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const host = `stint-git-${slug}-blakeeriks-projects`;
  return host.length > 63 ? null : `https://${host}.vercel.app`;
}

if (argv[1] === fileURLToPath(import.meta.url)) {
  const url = previewUrl(argv[2] ?? '');
  if (!url) {
    console.error(`${argv[2]} is too long for Vercel's branch alias.`);
    process.exit(1);
  }
  console.log(url);
}
