/**
 * Turning a position in a day column back into an instant.
 *
 * The calendar paints an entry by converting instants into a fraction of the
 * column; editing by drag needs the inverse. It is its own file because the
 * inverse has a trap the forward direction does not: the column spans a local
 * day, which is 23, 24 or 25 hours long, so a fraction cannot be multiplied by
 * a 24-hour constant. Every function here takes the column's real span.
 */

/**
 * Adjusting billable time by dragging resolves to the quarter hour.
 *
 * A pointer lands on whatever minute a pixel happens to be, so an unsnapped
 * drag would bill 09:07–10:52 and call it precision. The snap is also what
 * makes the gesture safe to offer at all: it is the difference between a 4px
 * slip being invisible and it being a billing change.
 */
export const SNAP_MINUTES = 15;

/** A drag shorter than this is a mis-click on a block, not an adjustment. */
export const DRAG_THRESHOLD_PX = 4;

/** The shortest entry a drag may produce. Below this a block is unreadable. */
export const MIN_ENTRY_MINUTES = 15;

/**
 * The instant at `fraction` through a column spanning `dayStart`–`dayEnd`,
 * snapped to `SNAP_MINUTES`.
 *
 * Snapping happens in elapsed time from the column's start rather than on the
 * wall clock, so on a spring-forward day the grid and the snap agree about
 * where 15 minutes is.
 */
export function instantAt(
  fraction: number,
  dayStart: Date,
  dayEnd: Date,
): Date {
  const span = dayEnd.getTime() - dayStart.getTime();
  const raw = dayStart.getTime() + clamp01(fraction) * span;
  return new Date(snapMs(raw - dayStart.getTime()) + dayStart.getTime());
}

/**
 * A duration in milliseconds, snapped to the grid.
 *
 * Used when a whole block moves: the duration is preserved exactly and only
 * the start snaps, because a move is not a resize. Rounding both ends
 * independently would silently change the duration by up to half a snap.
 */
export function snapMs(ms: number): number {
  const step = SNAP_MINUTES * 60_000;
  return Math.round(ms / step) * step;
}

/**
 * Move an entry so it starts at `start`, keeping its duration.
 *
 * The end is derived by adding the original elapsed milliseconds, not by
 * re-deriving a wall-clock time: a two-hour block dragged across a DST
 * boundary is still two hours of billable work, and re-deriving would make it
 * one or three.
 */
export function movedTo(
  startedAt: Date,
  endedAt: Date,
  start: Date,
): { startedAt: Date; endedAt: Date } {
  const duration = endedAt.getTime() - startedAt.getTime();
  return { startedAt: start, endedAt: new Date(start.getTime() + duration) };
}

/**
 * Resize an entry by moving one edge, refusing to invert it.
 *
 * Dragging the bottom edge above the top is not an overnight shift — the
 * gesture says "this block ends here" and there is no reading of it that makes
 * the entry end before it starts. It clamps to `MIN_ENTRY_MINUTES` instead,
 * which is what the user can see happening.
 */
export function resized(
  startedAt: Date,
  endedAt: Date,
  edge: 'start' | 'end',
  to: Date,
): { startedAt: Date; endedAt: Date } {
  const floor = MIN_ENTRY_MINUTES * 60_000;

  if (edge === 'start') {
    const latest = endedAt.getTime() - floor;
    return { startedAt: new Date(Math.min(to.getTime(), latest)), endedAt };
  }
  const earliest = startedAt.getTime() + floor;
  return { startedAt, endedAt: new Date(Math.max(to.getTime(), earliest)) };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
