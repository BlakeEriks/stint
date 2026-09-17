import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';

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
     is the question a version in the corner is there to answer — and a commit
     SHA answers it, where package.json's number was 0.0.0 on every build
     this app has ever shipped. */
  env: { NEXT_PUBLIC_APP_VERSION: buildVersion() },
};

export default config;
