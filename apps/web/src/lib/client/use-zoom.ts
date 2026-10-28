'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  fillPxPerHour,
  MAX_PX_PER_HOUR,
  MIN_PX_PER_HOUR,
  PX_PER_HOUR,
  zoomed,
} from '@stint/core';

/** Where the level is kept; stories set it to draw a zoomed grid. */
export const ZOOM_KEY = 'stint.calendar.pxPerHour';

/* One level for every day column, so an hour is one size on `/calendar` and
   in the dock alike. A device preference, like the dock split: it lives in
   `localStorage` and never reaches the server. */
const listeners = new Set<() => void>();

/* Read each time rather than cached, so clearing storage resets it. */
function read(): number {
  try {
    const v = Number.parseFloat(localStorage.getItem(ZOOM_KEY) ?? '');
    return Number.isFinite(v) && v >= MIN_PX_PER_HOUR && v <= MAX_PX_PER_HOUR
      ? v
      : PX_PER_HOUR;
  } catch {
    /* Private mode: the default. */
    return PX_PER_HOUR;
  }
}

function write(next: number) {
  try {
    localStorage.setItem(ZOOM_KEY, String(next));
  } catch {
    /* Private mode: the level is lost, and zoom stops at the default. */
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Pixels per hour, and the ref that makes a grid zoomable.
 *
 * A trackpad pinch arrives as a `wheel` with `ctrlKey` set, so one handler
 * takes the pinch, ⌘ + scroll and Ctrl + scroll. Only over the grid is the
 * browser's page zoom prevented, which needs a listener React cannot attach:
 * its `onWheel` is passive.
 *
 * The zoom stays anchored on the time under the pointer: the fraction of the
 * grid there is read before, and the scroller moves after layout so the same
 * fraction is under the pointer again.
 *
 * With `fill`, zooming out stops where the `hours` drawn still fill the
 * grid's scroll area, its parent when that scrolls, so the day never ends
 * above the area's bottom with empty space under it. Only for an area whose
 * height the layout sets: one sized by the grid would hold the floor at the
 * current zoom, and zoom-out would never move. A level stored below that is
 * drawn at it. The floor is measured, and follows the area's resizes.
 */
export function useZoom(hours: number, { fill }: { fill: boolean }) {
  /* The default on the server and on first paint, so hydration matches. */
  const stored = useSyncExternalStore(subscribe, read, () => PX_PER_HOUR);
  const [areaPx, setAreaPx] = useState(0);
  const min = fillPxPerHour(fill ? areaPx : 0, hours);
  const pxPerHour = Math.max(stored, min);
  /* The wheel listener is bound once, so it reads the floor from here. */
  const floor = useRef(min);
  floor.current = min;
  const anchor = useRef<{ el: HTMLElement; y: number; at: number } | null>(
    null,
  );

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const from = Math.max(read(), floor.current);
      const next = zoomed(from, event.deltaY, floor.current);
      /* At a limit nothing re-renders, so an anchor set here would fire on
         some later, unrelated render. */
      if (next === from) return;
      const box = el.getBoundingClientRect();
      if (box.height > 0)
        anchor.current = {
          el,
          y: event.clientY,
          at: (event.clientY - box.top) / box.height,
        };
      write(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    /* Asked on each resize, since a breakpoint can make the parent scroll or
       stop scrolling. */
    const resized = new ResizeObserver(() =>
      setAreaPx(scrollArea(el)?.clientHeight ?? 0),
    );
    if (el.parentElement) resized.observe(el.parentElement);
    return () => {
      el.removeEventListener('wheel', onWheel);
      resized.disconnect();
    };
  }, []);

  /* After the render a zoom caused, with the new height laid out. Every
     render, since nothing but a wheel sets the anchor. */
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    const box = a.el.getBoundingClientRect();
    scrollerOf(a.el).scrollBy(0, box.top + a.at * box.height - a.y);
  });

  return { pxPerHour, ref };
}

/**
 * The grid's parent when it is a scroll area, whose height the day should
 * fill. None where the page scrolls instead: there the grid sets its own
 * height, and measuring it would hold the zoom where it is.
 */
function scrollArea(el: HTMLElement): HTMLElement | null {
  const p = el.parentElement;
  if (!p) return null;
  const { overflowY } = getComputedStyle(p);
  return overflowY === 'auto' || overflowY === 'scroll' ? p : null;
}

/** The nearest ancestor that scrolls, or the page. */
function scrollerOf(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      p.scrollHeight > p.clientHeight
    )
      return p;
  }
  return document.scrollingElement ?? document.documentElement;
}
