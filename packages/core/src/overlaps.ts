/**
 * Shorter than this is a stop and a start clicked a few seconds apart, not
 * two things billed at once — flagging it fills the inbox with noise.
 */
export const MIN_OVERLAP_SECONDS = 60;

export interface Span {
  id: string;
  /** Epoch milliseconds, half-open: an end equal to another's start is not an overlap. */
  start: number;
  end: number;
}

export interface Overlap {
  /** The span that starts first; ties go to the lower id. */
  earlier: string;
  later: string;
  seconds: number;
}

/** Every pair sharing at least `minSeconds`, in start order. */
export function findOverlaps(
  spans: Span[],
  minSeconds = MIN_OVERLAP_SECONDS,
): Overlap[] {
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || (a.id < b.id ? -1 : 1),
  );
  const out: Overlap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i] as Span;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j] as Span;
      if (b.start >= a.end) break;
      const seconds = Math.floor((Math.min(a.end, b.end) - b.start) / 1000);
      if (seconds >= minSeconds)
        out.push({ earlier: a.id, later: b.id, seconds });
    }
  }
  return out;
}
