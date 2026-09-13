'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  startOfLocalDay,
  startOfLocalWeek,
  startOfLocalDayOffset,
  localDateKey,
} from '@stint/core';
import { api, type CalendarDay, type TimeEntry } from './api';
import { useTimeZone } from './use-timer';

export interface PositionedEntry {
  entry: TimeEntry;
  /** Fraction of the day, 0–1, so the grid can be any height. */
  top: number;
  height: number;
  /** Side-by-side lanes for entries that overlap in time. */
  lane: number;
  lanes: number;
}

/**
 * A week of logged time.
 *
 * The server groups by local day — a late-night entry must not land on a
 * different day on a different device — so this only positions what it is
 * given.
 */
/**
 * @param byDay Step one DAY at a time instead of one week.
 *
 *   A phone shows a single day — at 375px a week gives each day 42px, so a
 *   block is one letter wide and an overlapping one is 20px, which is a block
 *   you cannot read and therefore cannot check. The grid is the same component
 *   either way; only how many columns it renders and what the arrows mean
 *   change.
 *
 *   The FETCH stays weekly regardless. Stepping day by day inside a week then
 *   costs no request, and switching between the two views (rotating a phone,
 *   resizing a window) needs no refetch — the day view is a lens over week
 *   data, not a second data path.
 */
export function useCalendar(weekStartsOn = 1, byDay = false) {
  const tz = useTimeZone();

  /* ONE offset, counted in days from today, for both views.

     Two offsets (weeks and days) would drift apart the moment you crossed a
     breakpoint. Counting days and deriving the week from the selected day
     keeps them in lockstep: paging a week on desktop moves the cursor seven
     days, and rotating to a phone shows a day inside the week you were
     looking at. */
  const [cursorDays, setCursorDays] = useState(0);

  // Negative `daysBack` steps forward. Going through the core helper rather
  // than adding 86_400_000 matters: a week containing a DST transition is 167
  // or 169 hours and a fall-back day is 25, so fixed-millisecond arithmetic
  // lands an hour off and silently mis-buckets the entries at the edges.
  const cursor = useMemo(
    () =>
      startOfLocalDayOffset(startOfLocalDay(new Date(), tz), tz, -cursorDays),
    [tz, cursorDays],
  );

  const weekStart = useMemo(
    () => startOfLocalWeek(cursor, tz, weekStartsOn),
    [cursor, tz, weekStartsOn],
  );

  const weekEnd = useMemo(
    () => startOfLocalDayOffset(weekStart, tz, -7),
    [weekStart, tz],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', weekStart.toISOString(), tz],
    queryFn: () =>
      api.calendar({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
        tz,
      }),
  });

  const days = useMemo(() => {
    const byDate = new Map((data?.days ?? []).map((d) => [d.date, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const at = i === 0 ? weekStart : startOfLocalDayOffset(weekStart, tz, -i);
      const key = localDateKey(at, tz);
      const day: CalendarDay = byDate.get(key) ?? {
        date: key,
        totalSeconds: 0,
        entries: [],
      };
      /* Each day carries its OWN exclusive end. The component used to read it
         from the next column, which breaks the moment the list is filtered to
         one day — the fallback was the week's end, days away, and the
         fraction→instant maths a drag depends on would have been wrong by
         that much. A DST day is 23 or 25 hours, so this has to be the real
         next midnight rather than +24h. */
      const next = startOfLocalDayOffset(weekStart, tz, -(i + 1));
      return {
        at,
        end: next,
        ...day,
        positioned: position(day.entries, at, next),
      };
    });
  }, [data, weekStart, tz]);

  const weekSeconds = days.reduce((sum, d) => sum + d.totalSeconds, 0);

  /* The day view renders exactly one of the week's columns. Same objects, so
     positioning, laning and dragging are the code that already works — the
     view is a filter, not a second implementation. */
  const cursorKey = localDateKey(cursor, tz);
  const visible = byDay ? days.filter((d) => d.date === cursorKey) : days;

  /* What the header totals: the day on a phone, the week on a desktop.
     Labelling a week's hours over a single day's grid would misreport it. */
  const visibleSeconds = byDay ? (visible[0]?.totalSeconds ?? 0) : weekSeconds;

  const step = byDay ? 1 : 7;

  return {
    tz,
    /** The columns to render — one day on a phone, seven otherwise. */
    days: visible,
    /** Always all seven, for anything that needs the week regardless. */
    weekDays: days,
    weekStart,
    // The exclusive end of the week, so the last column can compute its own
    // span — a DST day is not 24 hours and the fraction→instant maths for a
    // drag needs the real one.
    weekEnd,
    weekSeconds,
    visibleSeconds,
    /** The selected day, which is also the week's anchor. */
    cursor,
    byDay,
    isLoading,
    /* Whether the period on screen contains today, which is what the
       "Today" / "This week" button reflects. Derived by comparing dates
       rather than by tracking a counter: on a phone only the cursor day
       counts, while on a desktop any day of this week does. */
    isCurrent: byDay
      ? cursorKey === localDateKey(startOfLocalDay(new Date(), tz), tz)
      : localDateKey(weekStart, tz) ===
        localDateKey(startOfLocalWeek(new Date(), tz, weekStartsOn), tz),
    next: () => setCursorDays((d) => d + step),
    prev: () => setCursorDays((d) => d - step),
    today: () => setCursorDays(0),
  };
}

/**
 * Place entries in the day column.
 *
 * Overlaps get side-by-side lanes rather than stacking, so no entry is hidden
 * behind another — in a billing tool a block you cannot see is a block you
 * cannot check.
 */
function position(
  entries: TimeEntry[],
  dayStart: Date,
  dayEnd: Date,
): PositionedEntry[] {
  const midnight = dayStart.getTime();
  // A DST day is 23 or 25 hours long, so the column's own span is the
  // denominator rather than a constant.
  const span = dayEnd.getTime() - midnight;
  const placed: PositionedEntry[] = [];

  for (const entry of entries) {
    const start = new Date(entry.startedAt).getTime();
    // A running entry draws up to now; it has no end yet.
    const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now();

    const top = clamp((start - midnight) / span);
    // A minimum height keeps a two-minute entry clickable.
    const height = Math.max(clamp((end - start) / span), 0.012);
    placed.push({
      entry,
      top,
      height: Math.min(height, 1 - top),
      lane: 0,
      lanes: 1,
    });
  }

  assignLanes(placed);
  return placed;
}

/** Greedy interval colouring: first lane whose last block has ended. */
function assignLanes(placed: PositionedEntry[]) {
  const sorted = [...placed].sort((a, b) => a.top - b.top);
  const laneEnds: number[] = [];

  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.top + 1e-9);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = item.top + item.height;
    item.lane = lane;
  }

  // Every block in a column shares the same lane count, so widths line up.
  const lanes = Math.max(1, laneEnds.length);
  for (const item of placed) item.lanes = lanes;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
