'use client';

import { useEffect, useState } from 'react';
import { formatClock } from '@stint/core';

/** Seeded mid-session, because a hero opening on `0:00:04` sells nothing. */
const SEED_SECONDS = 1 * 3600 + 47 * 60 + 32;

/**
 * The hero's running timer — the page's only client component, and the only
 * place the accent appears besides the CTA.
 *
 * It is a demonstration, not a real timer: nothing is tracked, nothing is
 * saved, and no session is involved. It exists because motion is the one
 * thing a competitor's static screenshot cannot reproduce, and because the
 * sensation it shows is the whole product.
 *
 * Counting starts from the seed on mount rather than from `Date.now()`, so
 * the server and the first client render agree on the digits — the same
 * hydration trap `useTimer` solves for the real thing. `suppressHydration
 * Warning` is deliberately NOT used: the values genuinely match.
 *
 * `formatClock` is the app's own formatter, so the marketing page and the
 * product cannot disagree about what a duration looks like.
 */
export function DemoTimer() {
  const [seconds, setSeconds] = useState(SEED_SECONDS);

  useEffect(() => {
    // Honour a reduced-motion preference: the readout holds its seeded value
    // and the page stays entirely legible at rest.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    /* A fragment of the real timer screen rather than a lone card: the
       running entry sits above the day's list, which is what makes it read as
       a product and not a widget. The rows are examples and say so by being
       plainly ordinary — no client would read them as their own data. */
    <div className="w-full rounded-xl bg-surface-primary p-6 shadow-float sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {/* Form and motion carry the running state alongside colour,
                because no green hue survives dichromacy — see
                docs/design/color.md. */}
            <span
              aria-hidden
              className="size-2.5 flex-none rounded-full bg-accent-default
                         motion-safe:animate-pulse"
            />
            <span className="type-timer text-accent-default">
              {formatClock(seconds)}
            </span>
          </div>
          <p className="type-meta mt-1.5 pl-[calc(0.625rem+0.75rem)] text-muted">
            Northwind Trading — API integration
          </p>
        </div>

        {/* Square stop button: the shape says "stop" before the label does,
            and it is neutral because the accent is already spent on the
            readout beside it. */}
        <span
          aria-hidden
          className="flex size-10 flex-none items-center justify-center rounded-lg
                     bg-surface-elevated text-muted"
        >
          <span className="size-3 rounded-[2px] bg-current" />
        </span>
      </div>

      <div className="mt-6 border-t border-edge-subtle pt-4">
        <p className="type-label mb-3 text-subtle">Today · 6:12:04</p>
        <ul className="flex flex-col gap-2.5">
          <EntryRow name="Checkout validation fixes" client="Northwind Trading" time="2:15:00" />
          <EntryRow name="Design review" client="Harbour & Co." time="1:30:00" />
          <EntryRow name="Q4 retainer scoping call" client="Harbour & Co." time="0:39:32" />
        </ul>
      </div>
    </div>
  );
}

function EntryRow({
  name,
  client,
  time,
}: {
  name: string;
  client: string;
  time: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 flex-1 truncate">
        <span className="type-control text-primary">{name}</span>{' '}
        <span className="type-meta text-subtle">{client}</span>
      </span>
      <span className="type-duration flex-none text-muted">{time}</span>
    </li>
  );
}
