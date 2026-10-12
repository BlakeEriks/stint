'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * The landing page's call to action: ask for an invite with an email address.
 *
 * It posts to a hosted form service (Formspree, `docs/deploying.md`), not to
 * Stint: an unauthenticated write to our own database would need rate
 * limiting, and an alpha list doesn't justify it (issue #55).
 *
 * A real `<form>` with the service as its `action`, so a visitor with
 * JavaScript off still reaches the list, landing on the service's own thank-
 * you page. With JavaScript, `Accept: application/json` makes the service
 * answer JSON and the page stays put.
 *
 * Local state rather than `useOptimisticMutation`: the landing page has no
 * query client, and this isn't a write to `/api/v1` (plan, Complexity
 * Tracking). It keeps Constitution VI's rules: pending on the control with
 * no time bound, and a failure said in the form that stays open.
 */
export function InviteRequest() {
  const endpoint = process.env.NEXT_PUBLIC_INVITE_FORM_URL;
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Unset outside production (`docs/deploying.md`): nowhere to send it.
    if (!endpoint) return setState('failed');
    setState('sending');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(e.currentTarget),
      });
      setState(res.ok ? 'sent' : 'failed');
    } catch (error) {
      // `fetch` rejects with a TypeError when the network fails; anything
      // else is a bug and is rethrown.
      if (!(error instanceof TypeError)) throw error;
      setState('failed');
    }
  }

  if (state === 'sent') {
    return (
      <div role="status" className="flex flex-col gap-1">
        <p className="type-heading text-strong">You&rsquo;re on the list.</p>
        <p className="type-support text-muted">
          If you&rsquo;re let in, the invite comes to {email} by email.
        </p>
      </div>
    );
  }

  return (
    <form
      method="post"
      action={endpoint}
      onSubmit={submit}
      className="flex w-full max-w-md flex-col gap-2"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            readOnly={state === 'sending'}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            /* The sign-in field's look: a neutral ring, since the accent is
               spent on the button beside it. */
            className="h-10 w-full rounded-md border border-edge-control bg-surface-elevated px-3 type-control
                       text-strong placeholder:text-subtle focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-edge-focus"
          />
        </label>
        {/* Formspree's honeypot: a bot fills every field, a person never
            sees this one, and the service drops what arrives with it set. */}
        <input
          type="text"
          name="_gotcha"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="hidden"
        />
        {/* The hero is the only place that wants a 40px button, so the
            height is a call-site override. */}
        <Button
          type="submit"
          variant="accent"
          disabled={state === 'sending'}
          className="h-10 px-4 type-nav"
        >
          {state === 'sending' ? 'Sending…' : 'Request an invite'}
        </Button>
      </div>
      {state === 'failed' ? (
        <p role="alert" className="type-support text-danger">
          Your request didn&rsquo;t send. Try again in a moment.
        </p>
      ) : null}
    </form>
  );
}
