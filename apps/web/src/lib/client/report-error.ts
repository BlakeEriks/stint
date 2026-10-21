'use client';

import { captureException } from '@sentry/nextjs';
import { browserClient } from './supabase';

/**
 * Sends an error a boundary caught to Sentry, tagged with who met it. The
 * user id only: the claims also hold the email, which stays out of Sentry.
 *
 * An error with a `digest` was thrown on the server, and `onRequestError`
 * (`instrumentation.ts`) has already reported it with its real message.
 */
export async function reportError(error: Error & { digest?: string }) {
  if (error.digest) return;
  let id: string | undefined;
  try {
    const { data } = await browserClient().auth.getClaims();
    id = data?.claims?.sub;
  } finally {
    captureException(error, id ? { user: { id } } : undefined);
  }
}
