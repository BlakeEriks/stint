'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { browserClient } from '@/lib/client/supabase';

/**
 * Magic link sign-in.
 *
 * Apple and Google can be added later as additional buttons — they are
 * independent Supabase providers, and accounts sharing an email address link
 * to one user automatically.
 */
export function SignInForm({
  error,
  deleted,
}: {
  error?: string;
  deleted?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');

    const db = browserClient();

    /* Clear this browser's auth state FIRST.
       The PKCE code verifier is stored under one key per origin, so a session
       or a half-finished sign-in left in another tab shares the slot: asking
       for a second link overwrites the verifier, and the eventual code
       exchange then fails against the wrong one. `/verify` still succeeds, so
       the link looks valid and the failure surfaces a step later as a dead
       link — which cost an hour to diagnose once.

       `scope: 'local'` only: this must not revoke sessions on the user's
       other devices. Reaching this form already means there is no usable
       session here — the page redirects home if there is. */
    await db.auth.signOut({ scope: 'local' });

    const { error } = await db.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setState('error');
      setMessage(error.message);
      return;
    }
    setState('sent');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1>
        <Wordmark />
      </h1>
      <p className="mt-1.5 type-control text-muted">
        Time tracking for solo contractors.
      </p>

      {deleted && state === 'idle' ? (
        <p
          role="status"
          className="mt-6 rounded-lg border border-edge-subtle bg-surface-base p-3 type-support text-muted"
        >
          Your account was deleted.
        </p>
      ) : null}

      {error && state === 'idle' ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-edge-subtle bg-surface-base p-3 type-support text-danger"
        >
          {EXPLAIN[error] ?? EXPLAIN.default}
        </p>
      ) : null}

      {state === 'sent' ? (
        <div className="mt-8 rounded-lg border border-edge-subtle bg-surface-base p-4">
          <p className="type-control text-primary">Check your email.</p>
          <p className="mt-1 type-support text-muted">
            We sent a sign-in link to {email}.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-subtle">Email</span>
            <input
              type="email"
              required
              // biome-ignore lint/a11y/noAutofocus: one field on the page; typing an email is the only thing to do here
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              /* Neutral ring, never the accent: a focus ring is constant and
                 involuntary, and this screen already spends its one accent on
                 the submit button below. */
              className="rounded-md border border-edge-control bg-surface-elevated px-3 py-2 type-control
                         text-strong placeholder:text-subtle focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-edge-focus"
            />
          </label>

          {/* The one screen with no timer in view, so the accent is free to
              mark its single action. */}
          <Button type="submit" variant="accent" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </Button>

          {state === 'error' ? (
            /* role=alert so a failed request is announced rather than only
               appearing — this is the one thing telling the user the email is
               not coming. */
            <p role="alert" className="type-support text-danger">
              {message}
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}

/**
 * Why the last attempt failed, in the user's terms.
 *
 * The callback redirects here with a reason and nothing rendered it, so every
 * failure read as "the link is broken" regardless of cause. A sign-in screen
 * that cannot say what went wrong sends the user to click the same dead link
 * again.
 */
const EXPLAIN: Record<string, string> = {
  invalid_link:
    'That link could not be used. It may have already been opened, or another tab started a different sign-in. Request a new one below.',
  missing_code: 'That link was incomplete. Request a new one below.',
  default: 'Something went wrong with that link. Request a new one below.',
};
