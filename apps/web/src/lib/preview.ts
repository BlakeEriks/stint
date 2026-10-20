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
 * The account for `pr`, or for its scenario `as`, or null where preview
 * sign-in does not exist.
 *
 * Vercel sets `VERCEL_ENV` to `preview` only on preview deployments, so
 * production and local dev answer null for every PR. Production holds no
 * `@preview.test` accounts either, so both would have to fail at once.
 *
 * `as` is a name from `SEED_SCENARIOS` in `scripts/seed-account.mjs`, whose
 * guard accepts the same shape.
 */
export function previewAccount(
  pr: string | null,
  vercelEnv: string | undefined,
  as: string | null = null,
): string | null {
  if (vercelEnv !== 'preview' || !pr || !/^\d{1,6}$/.test(pr)) return null;
  if (as === null) return `pr-${pr}@preview.test`;
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(as)) return null;
  return `pr-${pr}-${as}@preview.test`;
}

/**
 * Where `next` lands on `origin`, or `origin`'s root: never another host, and
 * never a throw on input the parser rejects. The URL it returns is used as
 * is — resolving a path a second time can turn `/.//evil.test` into a
 * protocol-relative URL.
 */
export function sameOriginURL(next: string | null, origin: string): string {
  const target = URL.canParse(next ?? '/', origin)
    ? new URL(next ?? '/', origin)
    : null;
  return target?.origin === origin ? target.href : `${origin}/`;
}
