'use client';

import Link from 'next/link';
import { AccountMenu } from './account-menu';
import { Wordmark } from './wordmark';

/**
 * The frame's top edge: wordmark on the left, account on the right.
 *
 * Painted straight onto the ground — no surface and no rule beneath it. Space
 * is what separates it from the panel, so the only edge in the frame is the
 * panel's own.
 */
export function AppHeader() {
  return (
    <header className="flex flex-none items-center justify-between gap-3 px-3 py-2 sm:px-4">
      <Link
        href="/"
        aria-label="Stint — home"
        className="flex-none rounded-md px-2 py-1 hover:bg-surface-hover"
      >
        <Wordmark />
      </Link>

      {/* `min-w-0` on a shrinkable wrapper, not `flex-none`: the trigger
          truncates a long address rather than pushing past the right edge. */}
      <div className="flex min-w-0 justify-end">
        <AccountMenu />
      </div>
    </header>
  );
}
