'use client';

import { Plus } from 'lucide-react';

/**
 * The keyboard path to adding an entry (WCAG 2.1.1). A pointer draws or
 * clicks a time on the grid instead, so this shows only on keyboard focus,
 * never on hover or touch: a visible add button would compete with the
 * grid that already is one.
 */
export function KeyboardAdd({
  label,
  onClick,
  className = '',
}: {
  /** The accessible name, which says where the entry goes. */
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`rounded-sm px-0.5 text-subtle opacity-0 transition-opacity
                  hover:text-primary focus-visible:opacity-100
                  focus-visible:ring-2 focus-visible:ring-edge-focus
                  focus-visible:outline-none ${className}`}
    >
      <Plus aria-hidden className="size-3" strokeWidth={2.5} />
    </button>
  );
}
