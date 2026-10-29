import * as Sentry from '@sentry/nextjs';
import { browserClient } from './lib/client/supabase';

/**
 * Sentry reports errors thrown in the browser. With no
 * `NEXT_PUBLIC_SENTRY_DSN` (locally, in previews, in CI) `init` does nothing.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
});

/* Each error names its user by id alone; the session also holds the email,
   which stays out of Sentry. */
browserClient().auth.onAuthStateChange((_event, session) => {
  Sentry.setUser(session ? { id: session.user.id } : null);
});
