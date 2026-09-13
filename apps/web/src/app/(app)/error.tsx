'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/page';

/**
 * A screen failed; the app did not.
 *
 * Nested inside `(app)`, so it replaces the CONTENT COLUMN and nothing else —
 * the rail, the header, the inbox and the running timer all keep rendering.
 * That matters more here than in most apps: the timer is billable work in
 * progress, and a white error page that unmounts it is the app losing track
 * of time it was trusted to keep. At the root it would take the frame with it.
 *
 * **Try again before anything else.** Most of what reaches here is transient —
 * a failed fetch, a route rendered mid-deploy — and `reset()` re-renders the
 * segment without a full reload, which keeps the timer's local tick intact.
 *
 * Next passes `digest` for an error thrown on the SERVER: the message itself
 * is withheld from the client in production so an internal detail cannot leak
 * into a stack trace on someone's screen. The digest is what correlates this
 * screen with the server log, so it is shown rather than hidden — a user who
 * can quote it makes a bug report actionable.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nothing collects this yet; the console is where it is findable today.
    console.error('Screen failed to render:', error);
  }, [error]);

  return (
    <Page>
      <div className="flex flex-col items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="type-title text-strong">This screen didn't load</h1>
          <p className="type-body max-w-prose text-muted">
            Something went wrong rendering it. Your tracked time is safe — the
            timer is still running if it was.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Ghost, not accent: the accent is the running timer, and a
              recovery action is not the liveliest thing on the screen. */}
          <Button type="button" onClick={reset}>
            <RotateCw aria-hidden className="size-3.5" />
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Go home</Link>
          </Button>
        </div>

        {error.digest ? (
          <p className="type-meta text-subtle">Reference {error.digest}</p>
        ) : null}
      </div>
    </Page>
  );
}
