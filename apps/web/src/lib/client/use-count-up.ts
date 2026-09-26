'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Tween a figure from whatever it last showed to what the server now says.
 *
 * The screen's largest numbers move for reasons the user cannot compute in
 * their head — a four-level rate lookup, an invoice clearing. Landing on the
 * new figure without the travel makes it look like the old one was wrong.
 */

/**
 * `--motion-count`, the one duration on the scale that is not a UI beat.
 *
 * A transition moves a thing already understood, so it wants to be over
 * before it is noticed — `--motion-quick` at 160ms. A count-up is the figure
 * being READ, and four digits crossing thousands need long enough for the eye
 * to follow.
 */
const DURATION = 900;

/** `--motion-ease-decelerate`, sampled rather than parsed out of the sheet. */
function ease(t: number) {
  return 1 - (1 - t) ** 3;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

/**
 * Where a figure starts on its first mount, as a fraction of its value.
 *
 * Near it, never zero: on a billing screen a frame far below the figure is a
 * balance the user does not have, and a full climb animates their whole
 * history as though it had just happened.
 */
const ARRIVAL = 0.92;

/**
 * Where "has this page already arrived?" is remembered.
 *
 * The `QueryClient` in `providers.tsx` is held in `useState` above the router:
 * it survives a client-side navigation and dies on reload, which is exactly
 * the line between a return to Home and a fresh load of it. Hanging the flag
 * there needs no route detection and no second provider.
 */
const ARRIVED = Symbol.for('stint.count-up.arrived');

/**
 * What is remembered is the value each NAMED figure was last shown holding.
 *
 * A single boolean set by the first hook would rest every figure after it —
 * the whole panel mounts in one pass, so figure two would read what figure one
 * just wrote. A timestamp window cannot tell a panel mounting together from a
 * navigation back a second later, which is the case this exists for. A set of
 * bare values collides: `home.html` says Earned and Unbilled read the same for
 * most of a monthly cycle, so the second of the two would find its own amount
 * already there and never roll.
 *
 * Keyed by the figure's own name, the three cases separate. Nothing recorded
 * means a fresh load, so it rolls. The same name at the same value is a
 * remount holding what the user already read, so it rests. The same name at a
 * new value is money that moved, and tweens from where it sat.
 */
type Arrivable = { [ARRIVED]?: Map<string, number> };

/**
 * Tween `to` from wherever the figure already was.
 *
 * The returned `value` always holds the SETTLED figure, so a tween that never
 * runs — a suspended rAF in a hidden tab, reduced motion, an unmount
 * mid-flight — leaves the answer on screen rather than a number the user does
 * not have.
 */
export function useCountUp(figure: string, to: number): { value: number } {
  const reduced = prefersReducedMotion();

  /* Decided ONCE per mount, in `useState`'s initializer: read in render it
     would flip under the figure mid-tween. */
  const client = useQueryClient();
  const [arrival] = useState(() => {
    const store = client as Arrivable;
    let seen = store[ARRIVED];
    if (!seen) {
      seen = new Map<string, number>();
      store[ARRIVED] = seen;
    }
    const shownBefore = seen.get(figure);
    seen.set(figure, to);
    /* Unseen: a fresh load, so roll. Seen at this very value: a remount
       holding what the user already read, so rest. Seen at another value:
       money moved, and the effect tweens it from where it sat. */
    return shownBefore == null;
  });

  const [value, setValue] = useState(to);

  /* The figure currently on screen, read by the next tween as its origin.
     State cannot serve: the effect closes over the value from its own render
     and would restart from a stale origin mid-flight. */
  const shown = useRef(value);
  shown.current = value;

  /* `to` at the time the last tween was scheduled. Without it, any re-render
     during a tween re-enters the effect and restarts it from the current
     position — the figure would crawl toward the target and never arrive. */
  /* On a FIRST arrival the origin is seeded below the figure so it rolls in.
     On a remount holding the same figures — a navigation away and back — it
     rests on `to`, and the effect's `previous === to` early return means no
     tween is scheduled at all. A value that actually CHANGES still tweens,
     from wherever the figure sat, which is the whole point of the roll. */
  const target = useRef(reduced || !arrival ? to : to * ARRIVAL);

  useEffect(() => {
    const previous = target.current;
    if (previous === to) return;
    target.current = to;

    /* Resting at the target means this is a fresh arrival, so it travels from
       the seeded origin; anything else is a tween still in flight, which
       retargets from where it sits rather than snapping back. */
    const start = shown.current === to ? previous : shown.current;
    if (reduced || start === to) {
      setValue(to);
      return;
    }

    const began = performance.now();
    let frame = 0;

    const step = (now: number) => {
      /* Clamped at BOTH ends: a rAF timestamp need not share an origin with
         `performance.now()`, and a negative `t` runs the ease backwards —
         the figure sweeps far below `start` before climbing, which on a
         billing screen renders as a large negative balance. */
      const t = Math.min(Math.max((now - began) / DURATION, 0), 1);
      if (t >= 1) {
        setValue(to);
        return;
      }
      setValue(start + (to - start) * ease(t));
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    /* Undoes everything the effect did, including the ref: StrictMode invokes
       it twice, and a `target` left at `to` makes the second pass early-return
       with no tween. The figure rests on the answer. */
    return () => {
      cancelAnimationFrame(frame);
      target.current = previous;
      setValue(to);
    };
  }, [to, reduced]);

  return { value };
}
