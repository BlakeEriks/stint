'use client';

import { useEffect, useState } from 'react';
import {
  PX_PER_HOUR,
  startOfLocalDay,
  startOfLocalDayOffset,
} from '@stint/core';
import type { TimeEntry } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { position, workedWindow } from '@/lib/client/use-calendar';
import type { useEntryDrag } from '@/lib/client/use-entry-drag';
import { useZoom } from '@/lib/client/use-zoom';
import { DayColumn, gutterMarks, HourGutter } from './day-column';

/** The least room between labeled hours: every hour at the default scale,
    since the dock is too narrow for the calendar's 3-hour step. */
const LABEL_GAP_PX = PX_PER_HOUR;

/**
 * Today's entries as a day column, in the dock.
 *
 * The list answers "what have I booked"; this answers "where did the day go",
 * which is the question that catches an hour nobody tracked. It is the
 * column `/calendar` draws — same window, same positions, same gestures. At
 * the default 44px a 15-minute entry is 11px tall; zooming in is what makes
 * one tall enough to grab an end of.
 */
export function TodayGrid({
  entries,
  colors,
  onEdit,
  onCreate,
  drag,
  fills = false,
}: {
  /** Today's entries INCLUDING the running one, unlike the list. */
  entries: TimeEntry[];
  colors: Map<string, string | null>;
  onEdit: (entry: TimeEntry) => void;
  onCreate: (startedAt: Date, endedAt: Date) => void;
  /** Owned by the caller, which owns the editor a drawn block waits on. */
  drag: ReturnType<typeof useEntryDrag>;
  /** Its scroll area's height is the dock column's, not its own: the day
      fills it rather than zooming out past it (`useZoom`). */
  fills?: boolean;
}) {
  /* The real next midnight, not +24h: a DST day is 23 or 25 hours and every
     position here is a fraction of the column's own span. */
  const dayStart = startOfLocalDay(new Date(), tz);
  const dayEnd = startOfLocalDayOffset(dayStart, tz, -1);

  /* A running block grows and the now-line moves, so both need a clock. A
     minute is the resolution the line is read at — a second's tick would
     re-render the column 60 times for a line that moves 0.7px. */
  const minute = useMinute();

  /* The window the entries want, then widened to reach NOW.
     `workedWindow` is derived from the entries alone, which is right for
     `/calendar` — it draws any day, and most days are not today. This column
     is always today, and a day whose grid stops before the current hour is a
     day you cannot see the rest of: stop at 13:00 having worked the morning
     and the now-line is drawn below the grid at 17:00, floating under it.

     Rounded out to the hour, like the rest of the window, so the gridlines
     and their labels stay on the hour. */
  const [worked, workedTo] = workedWindow(entries, dayStart, dayEnd);
  const [from, to] = minute
    ? withNow(worked, workedTo, new Date(), dayStart, dayEnd)
    : [worked, workedTo];

  const placed = position(entries, from, to);

  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  const { pxPerHour, ref } = useZoom(hours, { fill: fills });
  const height = hours * pxPerHour;
  const labels = gutterMarks(from, to, pxPerHour, LABEL_GAP_PX);

  /* Where now falls in the drawn window. The window covers it by
     construction, but the guard stays: it is the one value read off a clock
     rather than the data, so a zero-length window or a stale render must not
     put a line outside the grid it belongs to. */
  const at = minute ? fractionOf(new Date(), from, to) : null;
  const nowAt = at !== null && at >= 0 && at <= 1 ? at : null;

  /* No label of its own: the section around it is already "Today's entries",
     and a second one on the column reads as a nested region with the same
     name. */
  return (
    <div className="flex" ref={ref}>
      <HourGutter marks={labels} height={height} />

      <DayColumn
        positioned={placed}
        colors={colors}
        dayStart={from}
        dayEnd={to}
        marks={labels}
        height={height}
        drag={drag}
        onEdit={onEdit}
        onCreate={onCreate}
      >
        {nowAt !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-accent-default"
            style={{ top: `${nowAt * 100}%` }}
          >
            <span className="absolute -top-[3px] -left-[3px] size-1.5 rounded-full bg-accent-default" />
          </div>
        ) : null}
      </DayColumn>
    </div>
  );
}

/**
 * Re-render once a minute while something is moving.
 *
 * Returns false until after hydration, like `useTimer`'s own tick: a clock
 * read during SSR and again on the client lands on different minutes, which
 * React reports as a hydration mismatch. Until then there is no now-line,
 * which is correct — the server does not know what time it is here.
 */
function useMinute(): boolean {
  const [, force] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  /* Unconditional: the line moves whether or not a timer is running, and the
     window follows it. A tick gated on a running timer would freeze the line
     on an idle afternoon, which is the afternoon you most want it. */
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return hydrated;
}

/**
 * Widen a window so it contains `now`, rounded out to the hour.
 *
 * Only this column needs it. `/calendar` draws any day and takes its window
 * from the entries, which is correct there — the current time means nothing
 * on a day in the past. Here the column IS today, and the now-line is the
 * thing it exists to show.
 *
 * Clamped to the day, so a window can still never cross midnight and
 * `position()`'s fractions stay inside the column.
 */
function withNow(
  from: Date,
  to: Date,
  now: Date,
  dayStart: Date,
  dayEnd: Date,
): [Date, Date] {
  const hourMs = 3_600_000;
  /* Elapsed hours from the column's own start, not a wall clock: a DST day is
     23 or 25 hours long and the column is measured in elapsed time. */
  const hoursFrom = (at: Date) => (at.getTime() - dayStart.getTime()) / hourMs;
  const at = (hours: number) =>
    new Date(
      Math.min(
        Math.max(dayStart.getTime() + hours * hourMs, dayStart.getTime()),
        dayEnd.getTime(),
      ),
    );

  const nowH = hoursFrom(now);
  if (nowH >= hoursFrom(from) && nowH <= hoursFrom(to)) return [from, to];

  /* An hour of air on the side it grew, so the line is never flush against
     an edge with no room to read it. */
  return nowH < hoursFrom(from)
    ? [at(Math.floor(nowH) - 1), to]
    : [from, at(Math.ceil(nowH) + 1)];
}

const fractionOf = (at: Date, from: Date, to: Date) =>
  (at.getTime() - from.getTime()) / (to.getTime() - from.getTime());
