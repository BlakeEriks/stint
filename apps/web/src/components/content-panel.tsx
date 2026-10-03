'use client';

import { useMediaQuery } from '@/lib/client/use-media-query';

/**
 * THE PANEL. One surface with a subtle edge and the card's shadow — a step
 * above the rail and dock that flank it, because depth increases toward what
 * is being read. Nothing inside it is a card.
 *
 * It scrolls itself at `xl`, and there it takes focus: a screen with no
 * control in view is otherwise one Safari's keyboard cannot scroll. Below
 * `xl` the page scrolls instead, and a focusable panel would be an idle tab
 * stop.
 */
export function ContentPanel({ children }: { children: React.ReactNode }) {
  const scrolls = useMediaQuery('(width >= 80rem)');
  return (
    <div
      tabIndex={scrolls ? 0 : undefined}
      className="min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-primary shadow-card xl:col-start-2 xl:row-start-1 xl:overflow-y-auto"
    >
      {children}
    </div>
  );
}
