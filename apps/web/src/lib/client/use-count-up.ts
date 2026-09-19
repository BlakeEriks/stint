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

/** `--motion-quick`, which is the longest beat the token file defines. */
const DURATION = 160;

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
 * Tween `to` from wherever the figure already was.
 *
 * The origin is always what is on screen, so an interrupted tween picks up at
 * its current position rather than snapping back. The first render starts
 * settled: there is nothing on screen yet to travel from, and counting up on
 * arrival would report the whole figure as though it had just happened.
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
     position — the figure would crawl toward the target and never arrive. */
  const target = useRef<number | null>(null);

  useEffect(() => {
    if (target.current === to) return;
    target.current = to;

    const start = shown.current;
    if (reduced || start === to) {
      setValue(to);
      setRunning(false);
      return;
    }

    setRunning(true);
    const began = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const t = Math.min((now - began) / DURATION, 1);
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
    return () => cancelAnimationFrame(frame);
  }, [to, reduced]);

  return { value, running };
}
