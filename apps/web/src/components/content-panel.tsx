'use client';

import { useScrollerFocus } from '@/lib/client/use-scroller-focus';

/**
 * THE PANEL. One surface with a subtle edge and the card's shadow — a step
 * above the rail and dock that flank it, because depth increases toward what
 * is being read. Nothing inside it is a card.
 */
export function ContentPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      tabIndex={useScrollerFocus()}
      className="min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-primary shadow-card xl:col-start-2 xl:row-start-1 xl:overflow-y-auto"
    >
      {children}
    </div>
  );
}
