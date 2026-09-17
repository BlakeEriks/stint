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
 * `from` seeds the very first render: pass the last value this browser
 * displayed to animate an arrival, or omit it to start settled. Every later
 * change tweens from whatever was on screen, so an interrupted tween picks up
 * at its current position rather than snapping back.
 */
export function useCountUp(to: number, from?: number | null): CountUp {
  /* Reduced motion renders the SETTLED figure, not a skipped render and not a
     zero: the number is the content, so suppressing the animation must leave
     the answer on screen. Everything below is bypassed, never merely sped up. */
  const reduced = prefersReducedMotion();

  const [value, setValue] = useState(() => (reduced ? to : (from ?? to)));
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

/**
 * What this browser last displayed, so an arrival can animate the difference.
 *
 * Per **device**, never account state: two machines disagreeing is correct,
 * because each one animates what it has not shown you. Same guard as
 * `use-theme.ts` — a private window throws on both halves.
 */
function read(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // A private window can refuse writes. The figure still renders; the next
    // arrival just has nothing to animate from.
  }
}

/**
 * The arrival beat: tween from the figure this browser last showed.
 *
 * **A first load must not animate.** With nothing stored there is no "since",
 * so counting up from zero would report the user's entire history as though
 * it had just happened. No stored value renders settled and stores it.
 */
export function useSinceLastSeen(key: string, to: number | null | undefined) {
  /* `0` is a valid amount, so the absent case is null-ish and nothing else —
     a falsy check here would treat a genuine zero as "no figure yet" and
     re-animate from the stale stored value on every visit. */
  const settled = to ?? 0;
  const ready = to != null;

  /* Captured once, before the first write below lands: after that the stored
     value IS this figure, so re-reading would leave nothing to travel from. */
  const seen = useRef<number | null | undefined>(undefined);
  if (seen.current === undefined && ready) {
    seen.current = read(key);
  }

  const previous = seen.current ?? null;
  const { value, running } = useCountUp(settled, ready ? previous : null);

  useEffect(() => {
    if (ready) write(key, settled);
  }, [key, settled, ready]);

  return { value, running };
}
