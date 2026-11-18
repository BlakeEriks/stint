'use client';

import { Plus } from 'lucide-react';

/**
 * The keyboard path to adding an entry (WCAG 2.1.1). A pointer draws or
 * clicks a time on the grid instead, so this shows only on keyboard focus,
 * never on hover or touch: a visible add button would compete with the
 * grid that already is one.
 *
 * It sits out of flow beside the figure it follows, in a `relative` parent,
 * so the hidden "+" neither pushes that figure aside nor moves it when it
 * shows.
 */
export function KeyboardAdd({
  label,
  onClick,
  side,
}: {
  /** The accessible name, which says where the entry goes. */
  label: string;
  onClick: () => void;
  /** Which side of its parent it sits on. */
  side: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      /* Never a pointer target: an invisible button a click could still
         hit would open Add from empty space. Enter and Space still press
         it. */
      className={`pointer-events-none rounded-sm px-0.5 text-subtle opacity-0
                  transition-opacity focus-visible:opacity-100
                  focus-visible:ring-2 focus-visible:ring-edge-focus
                  focus-visible:outline-none absolute top-1/2 -translate-y-1/2 ${
                    side === 'left' ? 'right-full mr-1' : 'left-full ml-1'
                  }`}
    >
      <Plus aria-hidden className="size-3" strokeWidth={2.5} />
    </button>
  );
}
