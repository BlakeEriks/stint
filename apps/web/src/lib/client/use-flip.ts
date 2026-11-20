'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { motion } from '@stint/design-tokens';

const MOVE = Number.parseFloat(motion.move);
const QUICK = Number.parseFloat(motion.quick);
const EASE = motion['ease-standard'];

/** Lifted while it travels: above its neighbors, on the raised surface. */
const LIFT = ['relative', 'z-10', 'bg-surface-elevated', 'shadow-float'];

type Item = { el: HTMLElement; group?: string; fade?: boolean };

/** jsdom has no Web Animations, and reduced motion wants none. */
function canAnimate() {
  return (
    typeof Element.prototype.animate === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

type Place = { top: number; group?: string };

/** Play one item from where it was to where it is. */
function play({ el, group, fade }: Item, was: Place | undefined, top: number) {
  if (!was) {
    if (fade)
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: QUICK,
        easing: EASE,
      });
    return;
  }
  if (was.top === top) return;
  const travel = el.animate(
    [{ transform: `translateY(${was.top - top}px)` }, { transform: 'none' }],
    { duration: MOVE, easing: EASE },
  );
  if (was.group !== group) {
    el.classList.add(...LIFT);
    travel.onfinish = travel.oncancel = () => el.classList.remove(...LIFT);
  }
}

/**
 * Moves each registered element from where it last painted to where it now
 * sits (FLIP: first, last, invert, play), so a row that changes section is
 * seen going there and everything between slides to make room.
 *
 * `layout` is any string that changes when the order does. An item whose
 * `group` changed lifts while it travels; a new `fade` item fades in. With
 * reduced motion everything lands in place.
 */
export function useFlip(layout: string) {
  const container = useRef<HTMLElement | null>(null);
  const items = useRef(new Map<string, Item>());
  const last = useRef(new Map<string, Place>());

  const register = useCallback(
    (key: string, opts: Omit<Item, 'el'> = {}) =>
      (el: HTMLElement | null) => {
        if (el) items.current.set(key, { el, ...opts });
        else items.current.delete(key);
      },
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `layout` is the trigger; the positions are read from the DOM.
  useLayoutEffect(() => {
    const origin = container.current?.getBoundingClientRect().top ?? 0;
    const first = last.current;
    const live = canAnimate();
    const next = new Map<string, Place>();
    for (const [key, item] of items.current) {
      if (live) for (const a of item.el.getAnimations()) a.cancel();
      const top = item.el.getBoundingClientRect().top - origin;
      next.set(key, { top, group: item.group });
      // The first paint has nowhere to come from.
      if (live && first.size > 0) play(item, first.get(key), top);
    }
    last.current = next;
  }, [layout]);

  return { container, register };
}
