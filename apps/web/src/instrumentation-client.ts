import * as Sentry from '@sentry/nextjs';

/**
 * Sentry reports errors thrown in the browser: errors only, with no tracing
 * or replay. With no `NEXT_PUBLIC_SENTRY_DSN` (locally, in previews, in CI)
 * `init` does nothing.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
});
