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
import { timeZone as tz } from './use-timer';
import { keys } from './query-keys';

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
 * @param byDay Step one DAY at a time instead of one week, as a phone does.
 *
 *   The FETCH stays weekly regardless, so stepping inside a week and switching
 *   between the two views cost no request — the day view is a lens over week
 *   data, not a second data path.
 */
export function useCalendar(weekStartsOn = 1, byDay = false) {
  /* ONE offset, counted in days from today, for both views: two offsets would
     drift apart the moment you crossed the breakpoint. */
  const [cursorDays, setCursorDays] = useState(0);

  // Negative `daysBack` steps forward. Going through the core helper rather
  // than adding 86_400_000 matters: a week containing a DST transition is 167
  // or 169 hours and a fall-back day is 25, so fixed-millisecond arithmetic
  // lands an hour off and silently mis-buckets the entries at the edges.
  const cursor = useMemo(
    () =>
      startOfLocalDayOffset(startOfLocalDay(new Date(), tz), tz, -cursorDays),
    [cursorDays],
  );

  const weekStart = useMemo(
    () => startOfLocalWeek(cursor, tz, weekStartsOn),
    [cursor, weekStartsOn],
  );

  const weekEnd = useMemo(
    () => startOfLocalDayOffset(weekStart, tz, -7),
    [weekStart],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: keys.calendar(weekStart.toISOString(), tz),
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
      /* Each day carries its OWN exclusive end, so a list filtered to one day
         still has it. A DST day is 23 or 25 hours, so this is the real next
         midnight rather than +24h — the fraction→instant maths a drag depends
         on is wrong by an hour otherwise. */
      const next = startOfLocalDayOffset(weekStart, tz, -(i + 1));

      /* The hours the column draws. A phone crops to the worked range; the
         week view keeps all 24, since cropping one column would have to crop
         all seven to the busiest day's range. */
      const [from, to] = byDay ? workedWindow(day, at, next) : [at, next];

      return {
        at,
        end: next,
        /* What the column spans. Positions are fractions OF THIS, and so is
           the inverse maths a drag uses. */
        from,
        to,
        ...day,
        positioned: position(day.entries, from, to),
      };
    });
  }, [data, weekStart, byDay]);

  const weekSeconds = days.reduce((sum, d) => sum + d.totalSeconds, 0);

  /* The day view renders exactly one of the week's columns — a filter over the
     same objects, not a second implementation. */
  const cursorKey = localDateKey(cursor, tz);
  const visible = byDay ? days.filter((d) => d.date === cursorKey) : days;

  /* What the header totals: the day on a phone, the week on a desktop.
     Labelling a week's hours over a single day's grid would misreport it. */
  const visibleSeconds = byDay ? (visible[0]?.totalSeconds ?? 0) : weekSeconds;

  const step = byDay ? 1 : 7;

  return {
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
    isError,
    /* Whether the period on screen contains today, which is what the "Today" /
       "This week" button reflects. */
    isCurrent: byDay
      ? cursorKey === localDateKey(startOfLocalDay(new Date(), tz), tz)
      : localDateKey(weekStart, tz) ===
        localDateKey(startOfLocalWeek(new Date(), tz, weekStartsOn), tz),
    next: () => setCursorDays((d) => d + step),
    prev: () => setCursorDays((d) => d - step),
    today: () => setCursorDays(0),
  };
}

/** Hours of padding kept either side of the worked range. */
const WINDOW_PAD_HOURS = 1;

/** The window never shrinks below this, so a one-entry day is not a sliver. */
const MIN_WINDOW_HOURS = 10;

/** What an empty day shows: an ordinary working day, 07:00–19:00. */
const EMPTY_WINDOW = [7, 19] as const;

/**
 * The hours a single-day column should draw.
 *
 * Returns `[from, to]` as instants, snapped to whole hours so the gridlines
 * and their labels stay on the hour.
 *
 * **Derived from the entries, padded, floored.** The padding is room to drag a
 * block earlier or later; the floor stops a single 30-minute entry rendering
 * as a sliver.
 *
 * **It never crops past midnight in either direction**, so the window is
 * always a real subrange of the column's day and `instantAt` needs no special
 * case.
 *
 * A running entry counts up to now, matching how `position` draws it.
 */
function workedWindow(
  day: CalendarDay,
  dayStart: Date,
  dayEnd: Date,
): [Date, Date] {
  const hourMs = 3_600_000;
  const at = (hours: number) =>
    new Date(Math.min(dayStart.getTime() + hours * hourMs, dayEnd.getTime()));

  if (day.entries.length === 0)
    return [at(EMPTY_WINDOW[0]), at(EMPTY_WINDOW[1])];

  /* Hours from the column's own start, not wall-clock hours: a DST day is 23
     or 25 hours long, and the column is measured in elapsed time. */
  const hoursFrom = (iso: string) =>
    (new Date(iso).getTime() - dayStart.getTime()) / hourMs;

  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  for (const e of day.entries) {
    first = Math.min(first, hoursFrom(e.startedAt));
    last = Math.max(
      last,
      e.endedAt
        ? hoursFrom(e.endedAt)
        : (Date.now() - dayStart.getTime()) / hourMs,
    );
  }

  const span = (dayEnd.getTime() - dayStart.getTime()) / hourMs;
  let from = Math.max(0, Math.floor(first) - WINDOW_PAD_HOURS);
  let to = Math.min(span, Math.ceil(last) + WINDOW_PAD_HOURS);

  /* Grow to the floor, preferring to extend downward — later hours are the
     likelier place to add work, and growing upward first would reintroduce
     the empty early morning this exists to avoid. */
  if (to - from < MIN_WINDOW_HOURS) {
    to = Math.min(span, from + MIN_WINDOW_HOURS);
    from = Math.max(0, to - MIN_WINDOW_HOURS);
  }

  return [at(from), at(to)];
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
