'use client';

import Link from 'next/link';
import { AccountMenu } from './account-menu';
import { Feedback } from './feedback';
import { Wordmark } from './wordmark';

/**
 * The frame's top edge: wordmark on the left; Feedback and the account on
 * the right, where every screen has them.
 *
 * Painted straight onto the ground — no surface and no rule beneath it. Space
 * is what separates it from the panel, so the only edge in the frame is the
 * panel's own.
 *
 * Below `sm` the page scrolls, so the header is pinned to the top with the
 * nav beneath it (`Nav`), filled with the ground it is painted on so nothing
 * shows through. Its height is fixed there (`h-13`) so the nav knows where
 * to pin, and `globals.css` scroll-pads `<html>` clear of the two.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-13 flex-none items-center justify-between gap-3 bg-surface-base px-3 py-2 sm:static sm:h-auto sm:px-4">
      <Link
        href="/"
        aria-label="Stint — home"
        /* `-ml-2` cancels the link's own `px-2` at the left edge only: the
           padding is the hover target, but it should not also inset the
           mark, which sits further left than the rail beneath it. */
        className="-ml-2 flex-none rounded-md px-2 py-1 hover:bg-surface-hover"
      >
        <Wordmark size="small" />
      </Link>

      {/* `min-w-0` on a shrinkable wrapper, not `flex-none`: the trigger
          truncates a long address rather than pushing past the right edge. */}
      <div className="flex min-w-0 items-center justify-end gap-1">
        <Feedback />
        <AccountMenu />
      </div>
    </header>
  );
}
