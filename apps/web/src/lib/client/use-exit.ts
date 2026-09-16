'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Rows leaving a list: mark one, wait for its animation, then refetch.
 *
 * **The invalidation is deferred until the exit finishes**, so the row stays
 * in the query data the whole time it is animating. An invalidate-then-animate
 * order drops the row on the refetch and leaves the animation with nothing to
 * play, which is the mistake that costs a pile of machinery to undo.
 *
 * `getAnimations()` is what we wait on rather than an `animationend` listener:
 * it covers transitions too, and needs no timeout to bail on an animation that
 * never fires. jsdom implements none of it, so a test waits on nothing and
 * resolves at once — no fake timers.
 */
export function useExit() {
  const [exiting, setExiting] = useState<ReadonlySet<string>>(new Set());
  const nodes = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());

  /**
   * Ref callback for a row: `mark` needs the element to wait on, and the
   * unmount drops the id — so a row whose condition still holds, like a
   * runaway timer left running, comes back visible rather than collapsed.
   *
   * **Cached per id**, because React detaches and reattaches a ref whose
   * identity changed — which would clear the mark on the render that set it.
   */
  const register = useCallback((id: string) => {
    const cached = refs.current.get(id);
    if (cached) return cached;

    const ref = (el: HTMLElement | null) => {
      if (el) {
        nodes.current.set(id, el);
        return;
      }
      nodes.current.delete(id);
      setExiting((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
    refs.current.set(id, ref);
    return ref;
  }, []);

  /** Play the row out, resolving once it has. */
  const mark = useCallback((id: string) => {
    setExiting((prev) => new Set(prev).add(id));
    return finished(nodes.current, id);
  }, []);

  return { exiting, register, mark };
}

async function finished(nodes: Map<string, HTMLElement>, id: string) {
  if (
    typeof window === 'undefined' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  /* TWO frames, and the second is the one that matters. React commits the
     attribute during the first, but a rAF callback runs BEFORE style recalc,
     so at that point the transition does not exist yet and `getAnimations()`
     returns nothing — the wait resolves instantly, the refetch drops the row,
     and the exit never plays. Measured: one frame gives 0 animations, two
     give 2. */
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  const el = nodes.get(id);
  if (!el?.isConnected) return;

  /* A cancelled animation rejects, and jsdom implements no `getAnimations`
     at all — either way the row still has to go. */
  await Promise.allSettled(
    el.getAnimations?.({ subtree: true }).map((a) => a.finished) ?? [],
  );
}
