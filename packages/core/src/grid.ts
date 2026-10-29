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

/**
 * The entry a press-and-drag on empty grid draws, from where the pointer went
 * down to where it is now, each end snapped like any drag.
 *
 * Dragging upward draws the same range as dragging down, and a drag shorter
 * than `minMinutes` still draws that much, pushed back inside the column when
 * it would run past the end. A press without travel passes `clickMinutes`.
 */
export function drawnRange(
  from: number,
  to: number,
  dayStart: Date,
  dayEnd: Date,
  minMinutes = MIN_ENTRY_MINUTES,
): { startedAt: Date; endedAt: Date } {
  const a = instantAt(Math.min(from, to), dayStart, dayEnd).getTime();
  const b = instantAt(Math.max(from, to), dayStart, dayEnd).getTime();
  const floor = minMinutes * 60_000;
  const end = Math.min(Math.max(b, a + floor), dayEnd.getTime());
  return {
    startedAt: new Date(Math.min(a, end - floor)),
    endedAt: new Date(end),
  };
}

/** The lengths a click can make, shortest first. */
const CLICK_MINUTES = [15, 30, 60] as const;

/**
 * How long an entry a click on empty grid makes: the shortest of 15, 30 or
 * 60 minutes whose block is at least `labelPx` tall at this zoom, so the
 * slot shown under the pointer, which is that block, never clips its label.
 * An hour when even that is shorter.
 */
export function clickMinutes(pxPerHour: number, labelPx: number): number {
  return CLICK_MINUTES.find((m) => (m / 60) * pxPerHour >= labelPx) ?? 60;
}

/**
 * Pixels per hour on a day column: the default, and the range zoom moves in.
 * At 44px a 30-minute entry is the touch target; at 176px a 15-minute one is
 * 44px, tall enough to grab either end of.
 */
export const PX_PER_HOUR = 44;
export const MIN_PX_PER_HOUR = 22;
export const MAX_PX_PER_HOUR = 176;

/**
 * The scale after one wheel event, as a pinch or a modified scroll sends it.
 *
 * Exponential, so a pinch feels the same at every level, and capped per event,
 * because a mouse wheel's notch is a hundred times a trackpad's delta.
 */
export function zoomed(
  pxPerHour: number,
  deltaY: number,
  min = MIN_PX_PER_HOUR,
): number {
  const delta = Math.max(-100, Math.min(100, deltaY));
  const next = Math.max(pxPerHour, min) * Math.exp(-delta * 0.005);
  return Math.max(min, Math.min(MAX_PX_PER_HOUR, next));
}

/**
 * The least zoom at which `hours` still fill a scroll area `viewportPx`
 * tall: zoomed out past it, the day ends above the area's bottom and leaves
 * empty space under it. Never below `MIN_PX_PER_HOUR`, nor above the most.
 */
export function fillPxPerHour(viewportPx: number, hours: number): number {
  const fill = hours > 0 ? viewportPx / hours : 0;
  return Math.max(MIN_PX_PER_HOUR, Math.min(MAX_PX_PER_HOUR, fill));
}

/**
 * Hours between labeled gridlines: the smallest step that keeps labels at
 * least `minGapPx` apart at this scale, on hours a day divides into evenly.
 */
export function hourStep(pxPerHour: number, minGapPx: number): number {
  const steps = [1, 2, 3, 4, 6, 12];
  return steps.find((h) => h * pxPerHour >= minGapPx) ?? 12;
}

/**
 * The hour lines a day column labels between `from` and `to`, ends included:
 * every hour whose wall clock in `tz` is a multiple of `step`, at its place
 * as a percentage of the column.
 *
 * Walked in elapsed hours from `from` and labeled by each instant's own wall
 * clock, so on a 23- or 25-hour day a label names the hour the clock reads
 * there, and a repeated or skipped hour is drawn as the clock has it.
 */
export function hourMarks(
  from: Date,
  to: Date,
  step: number,
  tz: string,
): { hour: number; pct: number }[] {
  const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  });
  const span = to.getTime() - from.getTime();
  const marks: { hour: number; pct: number }[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 3_600_000) {
    const hour = Number(clock.format(new Date(t)));
    if (hour % step === 0)
      marks.push({ hour, pct: ((t - from.getTime()) / span) * 100 });
  }
  return marks;
}

/**
 * The strip in the entry dialog crops to the entry rather than drawing the
 * whole day: two hours either side, or the entry's own length when that is
 * longer, so a twelve-hour entry keeps some ground around it.
 *
 * Measured, not chosen: a full day across a 460px strip draws a 90-minute
 * entry 43px wide, which is not a thing anyone can grab an edge of.
 */
export const WINDOW_PAD_MINUTES = 120;

/**
 * The span a dialog strip draws for an entry, clamped to `dayStart`–`dayEnd`.
 *
 * Rounded out to a tick, which is what puts the strip's ends on labeled
 * ones; the step itself is at the line that picks it.
 *
 * Elapsed time from the day's start throughout, like everything else here, so
 * a 23- or 25-hour day does not shift the window off its own ticks.
 */
export function windowFor(
  startedAt: Date,
  endedAt: Date,
  dayStart: Date,
  dayEnd: Date,
): { from: Date; to: Date } {
  const minute = 60_000;
  const dayFrom = dayStart.getTime();
  const dayTo = dayEnd.getTime();

  const pad = Math.max(
    WINDOW_PAD_MINUTES * minute,
    endedAt.getTime() - startedAt.getTime(),
  );
  let from = startedAt.getTime() - pad;
  let to = endedAt.getTime() + pad;

  /* Shifted back inside the day rather than merely clipped, so an entry near
     midnight keeps the full window it would have had anywhere else. */
  if (from < dayFrom) {
    to += dayFrom - from;
    from = dayFrom;
  }
  if (to > dayTo) {
    from -= to - dayTo;
    to = dayTo;
  }

  /* Under five hours the ends round to the half hour. Two hours of padding
     either side of a short entry already spans 4h15, so a whole-hour step
     would round every short entry out to six hours and give back most of the
     width the padding was there to protect. */
  const step = to - from <= 5 * 60 * minute ? 30 * minute : 60 * minute;
  const round = (at: number, dir: 'down' | 'up') => {
    const elapsed = at - dayFrom;
    const snapped =
      dir === 'down'
        ? Math.floor(elapsed / step) * step
        : Math.ceil(elapsed / step) * step;
    return dayFrom + snapped;
  };

  return {
    from: new Date(Math.max(dayFrom, round(from, 'down'))),
    to: new Date(Math.min(dayTo, round(to, 'up'))),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
