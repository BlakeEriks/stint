import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

/* The commit the bundle was built from, seven characters of it.
 *
 * Vercel hands it over directly; a build anywhere else asks git. Neither is
 * guaranteed — a build from a tarball has no .git, and `execSync` throws
 * rather than returning empty — so 'dev' is the floor. */
function buildVersion(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (fromVercel) return fromVercel;
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

const config: NextConfig = {
  // Shared workspace packages ship as TypeScript source.
  transpilePackages: ['@stint/core', '@stint/schema'],

  /* Read at BUILD time, so the rail can show it from a client component
     without shipping anything else to the browser. A version baked into the
     bundle is also the honest one: it names the build being looked at, which
     is the question a version in the corner is there to answer. A commit SHA
     answers it; `package.json`'s number does not move between releases. */
  env: { NEXT_PUBLIC_APP_VERSION: buildVersion() },

  // Projects moved under Clients; old bookmarks land there, query and all.
  async redirects() {
    return [{ source: '/projects', destination: '/clients', permanent: true }];
  },
};

/* Uploads the server and browser source maps on a production build, then
   deletes the browser's so they never ship. With no `SENTRY_AUTH_TOKEN`
   (locally, in previews) the upload is skipped and the build still passes. */
export default withSentryConfig(config, {
  org: 'stint-i5',
  project: 'stint',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
});
