'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'stint.dock.split';

/**
 * How much of the dock the inbox gets, as a fraction.
 *
 * Half by default: the two regions answer different questions and neither is
 * the reason the column exists, so nothing justifies favouring one before the
 * user says so.
 */
export const DEFAULT_SPLIT = 0.5;

/**
 * The range the handle moves in.
 *
 * Neither end is zero. A region dragged to nothing is a region you forget is
 * there — and getting it back means finding a handle flush against an edge.
 * A quarter still shows the inbox's first row and about two hours of the day,
 * which is enough to know what you collapsed and to drag it open again.
 */
export const MIN_SPLIT = 0.25;
export const MAX_SPLIT = 0.75;

const clamp = (v: number) => Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, v));

/** Stored fraction, or the default. Private-mode reads throw, so it is guarded. */
function stored(): number {
  try {
    const v = Number.parseFloat(localStorage.getItem(KEY) ?? '');
    return Number.isFinite(v) ? clamp(v) : DEFAULT_SPLIT;
  } catch {
    return DEFAULT_SPLIT;
  }
}

/**
 * A draggable divider between the inbox and Today.
 *
 * The ratio is a **device preference**, like the theme: it describes this
 * screen rather than the account, and a laptop and a monitor want different
 * answers. So it lives in `localStorage` and never reaches the server.
 *
 * Returns the fraction the INBOX gets. Today takes the rest, and both keep
 * their own scrollers — dragging changes how the column is divided, never
 * what is in it.
 */
export function useDockSplit(column: React.RefObject<HTMLElement | null>) {
  /* The default on the server and on first paint, corrected after mount:
     reading storage in the initialiser renders one value on the server and
     another on the client, which is a hydration mismatch. */
  const [split, setSplit] = useState(DEFAULT_SPLIT);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setSplit(stored()), []);

  /* The live fraction, so `move` does not need `split` in a dependency and
     re-bind its handlers on every pixel. */
  const live = useRef(DEFAULT_SPLIT);
  live.current = split;

  const begin = useCallback((event: React.PointerEvent) => {
    setDragging(true);
    /* The handle is 1px of rule inside a small hit area, and the pointer
       leaves it on the first move. Stop the browser starting a text selection
       instead. */
    event.preventDefault();
  }, []);

  /**
   * While dragging, the WINDOW owns the gesture.
   *
   * Pointer capture on the handle is the obvious alternative and it does not
   * work here: the handle is re-rendered on every move as the split changes,
   * and the capture goes with the element it was set on. Listening on the
   * window instead means the drag survives the pointer moving anywhere —
   * including outside the column, where it should clamp rather than stop.
   */
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const box = column.current?.getBoundingClientRect();
      if (!box || box.height === 0) return;
      const next = clamp((event.clientY - box.top) / box.height);
      live.current = next;
      setSplit(next);
    };

    const onUp = () => {
      setDragging(false);
      /* Written on release rather than on every move: a drag is one decision,
         and a write per pixel is a hundred writes for it. */
      try {
        localStorage.setItem(KEY, String(live.current));
      } catch {
        /* Private mode. The split still works for this session. */
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, column]);

  /**
   * Nudge by a step, for the keyboard. The handle is a real control, so it
   * has to be usable without a pointer — a mouse-only divider is a preference
   * some people cannot set.
   */
  const nudge = useCallback((delta: number) => {
    setSplit((current) => {
      const next = clamp(current + delta);
      live.current = next;
      try {
        localStorage.setItem(KEY, String(next));
      } catch {
        /* As above. */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    live.current = DEFAULT_SPLIT;
    setSplit(DEFAULT_SPLIT);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* As above. */
    }
  }, []);

  return { split, dragging, begin, nudge, reset };
}
