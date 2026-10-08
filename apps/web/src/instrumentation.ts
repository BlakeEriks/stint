import * as Sentry from '@sentry/nextjs';

/**
 * Sentry reports unhandled server errors. With no `SENTRY_DSN` (locally, in
 * previews, in CI) `init` does nothing.
 *
 * `handle()` (`lib/errors.ts`) catches a route's error before Next sees it,
 * so it reports its own; `onRequestError` covers pages and everything else.
 */
export function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}

export const onRequestError = Sentry.captureRequestError;
