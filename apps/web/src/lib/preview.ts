/**
 * The seeded account behind a PR's preview deployment.
 *
 * Every open PR gets its own account on the preview project, seeded by
 * `.github/workflows/preview-db.yml` from that branch's `seed-account.mjs`,
 * so one link signs the reviewer in on the data the PR was built to show.
 */

/** Matches `LOCAL_PASSWORD` in `scripts/seed-account.mjs`, which sets it. */
export const PREVIEW_PASSWORD = 'devpassword123';

/**
 * The account for `pr`, or null where preview sign-in does not exist.
 *
 * Vercel sets `VERCEL_ENV` to `preview` only on preview deployments, so
 * production and local dev answer null for every PR. Production holds no
 * `@preview.test` accounts either, so both would have to fail at once.
 */
export function previewAccount(
  pr: string | null,
  vercelEnv: string | undefined,
): string | null {
  if (vercelEnv !== 'preview' || !pr || !/^\d{1,6}$/.test(pr)) return null;
  return `pr-${pr}@preview.test`;
}

/**
 * `next` as a path on `origin`, or `/`. Resolved by the URL parser rather
 * than prefix checks, which a tab or newline in `next` slips past.
 */
export function samePath(next: string | null, origin: string): string {
  const target = new URL(next ?? '/', origin);
  return target.origin === origin
    ? target.pathname + target.search + target.hash
    : '/';
}
