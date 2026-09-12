'use client';

import Link from 'next/link';
import { AccountMenu } from './account-menu';

/**
 * The frame's top edge: wordmark on the left, account on the right.
 *
 * It exists to give the three columns beneath it a shared horizontal line to
 * hang from. Without it the rail, the content and the dock each start at the
 * top of the viewport independently, which reads as three strips rather than
 * one frame — the thing that makes a rail-plus-dock layout feel assembled is
 * that everything is bounded by the same header and the same timer bar.
 *
 * It also buys a row back on a phone. The stack there used to be wordmark +
 * timer, then the section scroller, then the account row: three bands before
 * any content. Now it is header, then sections — and the timer is docked at
 * the bottom.
 *
 * The wordmark stays the Home link, which is the convention a logo click
 * already implies.
 */
export function AppHeader() {
  return (
    <header className="flex flex-none items-center justify-between gap-3 border-b border-edge-subtle bg-surface-recessed px-3 py-2 sm:px-4">
      <Link
        href="/"
        aria-label="Stint — home"
        className="type-wordmark flex-none rounded-md px-2 py-1 text-strong hover:bg-surface-hover"
      >
        Stint
      </Link>

      {/* The account sits here rather than at the foot of the rail. It is
          identity, which belongs with the wordmark at the top edge, and the
          rail is then purely places you go.

          `min-w-0` on a shrinkable wrapper, not `flex-none`: the trigger
          truncates a long address rather than pushing past the right edge. */}
      <div className="flex min-w-0 justify-end">
        <AccountMenu />
      </div>
    </header>
  );
}
