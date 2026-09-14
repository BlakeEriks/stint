'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Rows that have been dealt with but are still on screen, playing their exit.
 *
 * **A removed row has to outlive its own data.** Every inbox action ends in
 * `invalidateQueries`, and the refetch drops the row from the next render —
 * so by the time anything could animate, the element is already gone. Holding
 * the id here keeps rendering it for one animation, from data the query no
 * longer returns.
 *
 * The id is released on `animationend` rather than a timer, so the class and
 * the bookkeeping cannot disagree about how long 260ms is.
 *
 * **Claiming a row and collapsing it are two steps.** A dialog has to claim
 * its row the moment the save lands, or the refetch drops it and there is
 * nothing left to animate — but the collapse itself must wait until the dialog
 * is off the screen, or it plays underneath the overlay. `hold` claims without
 * animating; `release` starts the exit. `leave` does both at once, which is
 * what an inline button wants.
 *
 * Nothing here knows what a row looks like: the component decides what to
 * render for a leaving id, and `.leaving` (globals.css) decides how it goes.
 */
export function useLeaving() {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  /** Claimed, still rendered at full height, not yet collapsing. */
  const [held, setHeld] = useState<ReadonlySet<string>>(new Set());

  const leave = useCallback((id: string) => {
    setLeaving((prev) => new Set(prev).add(id));
  }, []);

  const hold = useCallback((id: string) => {
    setHeld((prev) => new Set(prev).add(id));
  }, []);

  const release = useCallback((id: string) => {
    setHeld((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setLeaving((prev) => new Set(prev).add(id));
  }, []);

  const settle = useCallback((id: string) => {
    setLeaving((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  /* Every id the caller must keep rendering — collapsing or merely claimed. */
  const keeping = useMemo(
    () => new Set([...held, ...leaving]),
    [held, leaving],
  );

  return { keeping, leaving, leave, hold, release, settle };
}
