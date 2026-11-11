'use client';

import { isAuthError } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { elevatedInputClass } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Turnstile } from '@/components/turnstile';
import { Wordmark } from '@/components/wordmark';
import { ApiError, api } from '@/lib/client/api';
import { forgetCache } from '@/lib/client/query-cache';
import { browserClient } from '@/lib/client/supabase';
import { sameOriginURL } from '@/lib/preview';

/**
 * Magic link sign-in. When the CAPTCHA fails, an existing account signs in
 * with an emailed code instead, as the macOS and phone apps do.
 *
 * Apple and Google can be added later as additional buttons — they are
 * independent Supabase providers, and accounts sharing an email address link
 * to one user automatically.
 */
export function SignInForm({
  error,
  deleted,
  captchaSiteKey,
  next,
}: {
  error?: string;
  deleted?: boolean;
  /** Turnstile's site key where the Auth server asks for a CAPTCHA:
      production. Unset, the form sends none. */
  captchaSiteKey?: string;
  /** Where the link lands once signed in; `/auth/callback` keeps it on
      this site. */
  next?: string;
}) {
  /* The only way in for the next account, so nothing the last one kept in
     this browser survives past here (FR-009). */
  useEffect(() => forgetCache(), []);

  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  /* A blocker or network kept the CAPTCHA from Cloudflare. `/auth/code`
     needs none, and mails only an account that exists, so it can't open
     sign-up to bots. */
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  // A token is spent by the request it rides on; a new key draws a new one.
  const [attempt, setAttempt] = useState(0);
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

    if (captchaFailed) return requestCode();

    const { error } = await db.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ''
        }`,
        captchaToken: captchaToken ?? undefined,
      },
    });

    if (error) {
      setState('error');
      setMessage(
        error.code === 'captcha_failed'
          ? 'Stint couldn’t confirm you’re not a bot. Try again.'
          : error.message,
      );
      setCaptchaToken(null);
      setAttempt((n) => n + 1);
      return;
    }
    setState('sent');
  }

  async function requestCode() {
    try {
      await api.requestCode({ email });
    } catch (e) {
      // A refusal, or a network that also blocks this site.
      if (!(e instanceof ApiError || e instanceof TypeError)) throw e;
      setState('error');
      setMessage(
        e instanceof ApiError ? e.message : 'Request failed. Try again.',
      );
      return;
    }
    setCodeSent(true);
    setState('idle');
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    // `email`: `magiclink` is the link's hashed token and rejects a typed code.
    const { error } = await browserClient().auth.verifyOtp({
      email,
      token: code.replace(/\D/g, ''),
      type: 'email',
    });
    if (error) {
      if (!isAuthError(error)) throw error;
      setState('error');
      setMessage(
        WRONG_CODE.has(error.code ?? '')
          ? 'That code didn’t work. Codes work once and expire after 24 hours.'
          : error.message,
      );
      return;
    }
    // A full load, so the server renders the session it now reads.
    window.location.replace(
      sameOriginURL(next ?? null, window.location.origin),
    );
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

      {codeSent ? (
        <form onSubmit={verify} className="mt-8 flex flex-col gap-3">
          <p className="type-support text-muted">
            If {email} has an account, a code is on its way.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-subtle">Sign-in code</span>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{3} ?\d{3}"
              maxLength={7}
              // biome-ignore lint/a11y/noAutofocus: the code is the only thing left to type
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`py-2 ${elevatedInputClass}`}
            />
          </label>
          <Button type="submit" variant="accent" disabled={state === 'sending'}>
            {state === 'sending' ? 'Signing in…' : 'Sign in'}
          </Button>
          {state === 'error' ? (
            <p role="alert" className="type-support text-danger">
              {message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCodeSent(false);
              setCode('');
              setState('idle');
            }}
          >
            Send a new code
          </Button>
        </form>
      ) : state === 'sent' ? (
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
              className={`py-2 ${elevatedInputClass}`}
            />
          </label>

          {captchaSiteKey ? (
            <Turnstile
              key={attempt}
              siteKey={captchaSiteKey}
              onToken={(token) => {
                setCaptchaToken(token);
                // Turnstile retries its own errors; a token means it recovered.
                if (token) setCaptchaFailed(false);
              }}
              onFailed={() => setCaptchaFailed(true)}
            />
          ) : null}

          {captchaFailed ? (
            <p role="alert" className="type-support text-muted">
              The check that you’re not a bot didn’t load. An existing account
              can sign in with a code by email. To sign up, allow
              challenges.cloudflare.com, then reload.
            </p>
          ) : null}

          {/* The one action this screen exists to complete, so it takes the
              accent. */}
          <Button
            type="submit"
            variant="accent"
            disabled={
              state === 'sending' ||
              (captchaSiteKey != null && !captchaToken && !captchaFailed)
            }
          >
            {state === 'sending'
              ? 'Sending…'
              : captchaFailed
                ? 'Email me a code'
                : 'Email me a sign-in link'}
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

/** GoTrue's answers to a code that is wrong, spent or expired. */
const WRONG_CODE = new Set(['otp_expired', 'invalid_credentials']);
