'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tween a figure from whatever it last showed to what the server now says.
 *
 * The screen's largest numbers move for reasons the user cannot compute in
 * their head — a four-level rate lookup, an invoice clearing. Landing on the
 * new figure without the travel makes it look like the old one was wrong.
 *
 * No dependency and no CSS: a keyframe animates a *style*, and what has to
 * move here is the rendered text of a number.
 */

/**
 * `--motion-count`, and the one duration on the scale that is not a UI beat.
 *
 * A transition moves a thing that is already understood, so it wants to be
 * over before it is noticed — `--motion-quick` at 160ms. A count-up is the
 * figure being READ: four digits crossing thousands need long enough for the
 * eye to follow the travel, and at a transition's speed the number simply
 * changes. Hence its own token rather than stretching `quick`, which every
 * real transition still uses.
 */
const DURATION = 900;

/** `--motion-ease-decelerate`, sampled rather than parsed out of the sheet. */
function ease(t: number) {
  return 1 - (1 - t) ** 3;
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

/**
 * The value to render, and whether it is still travelling.
 *
 * `running` is for the decoration beside the figure — the delta chip, the
 * cyan — never for the figure itself, which is always `value`.
 */
export type CountUp = { value: number; running: boolean };

/**
 * How much of the journey a figure has already made when it first mounts.
 *
 * A load has nothing on screen to travel from, so the origin is chosen rather
 * than remembered — and counting up from ZERO would report the whole figure as
 * though it had just happened: on a billing screen, a frame reading $1,800
 * against a real $4,001 is a balance the user never had. Starting most of the
 * way there keeps the arrival visible while every frame stays too close to the
 * figure to be misread as a different one.
 */
const ARRIVAL = 0.92;

/**
 * Tween `to` from wherever the figure already was.
 *
 * The origin is always what is on screen, so an interrupted tween picks up at
 * its current position rather than snapping back. A first mount has nothing on
 * screen yet, so it arrives from `ARRIVAL` instead.
 *
 * `value` always holds the SETTLED figure, never the animation's origin: the
 * number is the content, so a tween that never runs — a hidden tab whose rAF
 * is suspended, reduced motion, an unmount mid-flight — must leave the answer
 * on screen rather than a number the user does not have.
 */
export function useCountUp(to: number): CountUp {
  /* Reduced motion renders the SETTLED figure, not a skipped render and not a
     zero: the number is the content, so suppressing the animation must leave
     the answer on screen. Everything below is bypassed, never merely sped up. */
  const reduced = prefersReducedMotion();

  const [value, setValue] = useState(to);
  const [running, setRunning] = useState(false);

  /* The figure currently on screen, read by the next tween as its origin.
     State cannot serve: the effect closes over the value from its own render
     and would restart from a stale origin mid-flight. */
  const shown = useRef(value);
  shown.current = value;

  /* `to` at the time the last tween was scheduled. Without it, any re-render
     during a tween re-enters the effect and restarts it from the current
     position — the figure would crawl toward the target and never arrive.

     Seeded to the arrival's origin rather than null, so a first mount takes
     the ordinary "the target moved" path and needs no special case. */
  const target = useRef(reduced ? to : to * ARRIVAL);

  useEffect(() => {
    const previous = target.current;
    if (previous === to) return;
    target.current = to;

    /* Resting at the target means this is a fresh arrival, so it travels from
       the seeded origin; anything else is a tween still in flight, which
       retargets from where it currently sits rather than snapping back. */
    const start = shown.current === to ? previous : shown.current;
    if (reduced || start === to) {
      setValue(to);
      setRunning(false);
      return;
    }

    setRunning(true);
    const began = performance.now();
    let frame = 0;

    const step = (now: number) => {
      /* Clamped at BOTH ends. `requestAnimationFrame` hands its callback a
         timestamp that need not share an origin with `performance.now()` —
         under fake timers it does not — and a negative `t` runs the ease
         backwards, so the figure sweeps far below `start` before climbing.
         On a billing screen that renders as a large negative balance. */
      const t = Math.min(Math.max((now - began) / DURATION, 0), 1);
      if (t >= 1) {
        /* The exact server figure, never the last interpolation: this is a
           billing screen, and a tween that settles a cent off has silently
           changed what the app reports. */
        setValue(to);
        setRunning(false);
        return;
      }
      setValue(start + (to - start) * ease(t));
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    /* Undoes everything the effect did, which is what makes it idempotent —
       and StrictMode double-invokes it (mount, cleanup, mount) precisely to
       check that. Leaving `target` at `to` made the second, real invocation
       early-return, so no tween ever ran in the app while tests without a
       StrictMode wrapper stayed green. The figure rests on the answer. */
    return () => {
      cancelAnimationFrame(frame);
      target.current = previous;
      setValue(to);
      setRunning(false);
    };
  }, [to, reduced]);

  return { value, running };
}
