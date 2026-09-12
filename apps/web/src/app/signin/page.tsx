'use client';

import { useState } from 'react';
import { browserClient } from '@/lib/client/supabase';

/**
 * Magic link sign-in.
 *
 * Apple and Google can be added later as additional buttons — they are
 * independent Supabase providers, and accounts sharing an email address link
 * to one user automatically.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');

    const { error } = await browserClient().auth.signInWithOtp({
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
      <h1 className="text-2xl font-semibold tracking-tight text-strong">
        Stint
      </h1>
      <p className="mt-1.5 text-[14px] text-muted">
        Time tracking for solo contractors.
      </p>

      {state === 'sent' ? (
        <div className="mt-8 rounded-lg border border-edge-subtle bg-surface-base p-4">
          <p className="text-[14px] text-primary">Check your email.</p>
          <p className="mt-1 text-[13px] text-muted">
            We sent a sign-in link to {email}.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
              Email
            </span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-md border border-edge-control bg-surface-elevated px-3 py-2 text-[14px]
                         text-strong placeholder:text-subtle focus:outline-none
                         focus:ring-2 focus:ring-accent-default"
            />
          </label>

          <button
            type="submit"
            disabled={state === 'sending'}
            className="rounded-md bg-accent-default px-3 py-2 text-[14px] font-medium
                       text-on-accent transition-colors hover:bg-accent-hover
                       disabled:opacity-60"
          >
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>

          {state === 'error' ? (
            <p className="text-[13px] text-danger">{message}</p>
          ) : null}
        </form>
      )}
    </main>
  );
}
