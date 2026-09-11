'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
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
export function useCalendar(weekStartsOn = 1) {
  const tz = useTimeZone();
  const [offset, setOffset] = useState(0);

  // Negative `daysBack` steps forward. Going through the core helper rather
  // than adding 7 * 86_400_000 matters: a week containing a DST transition is
  // 167 or 169 hours, so fixed-millisecond arithmetic lands an hour off and
  // silently mis-buckets the entries at the edges.
  const weekStart = useMemo(() => {
    const base = startOfLocalWeek(new Date(), tz, weekStartsOn);
    return offset === 0 ? base : startOfLocalDayOffset(base, tz, -offset * 7);
  }, [tz, weekStartsOn, offset]);

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
      const next = startOfLocalDayOffset(weekStart, tz, -(i + 1));
      return { at, ...day, positioned: position(day.entries, at, next) };
    });
  }, [data, weekStart, tz]);

  const weekSeconds = days.reduce((sum, d) => sum + d.totalSeconds, 0);

  return {
    tz,
    days,
    weekStart,
    weekSeconds,
    isLoading,
    offset,
    next: () => setOffset((o) => o + 1),
    prev: () => setOffset((o) => o - 1),
    today: () => setOffset(0),
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
    const end = entry.endedAt
      ? new Date(entry.endedAt).getTime()
      : Date.now();

    const top = clamp((start - midnight) / span);
    // A minimum height keeps a two-minute entry clickable.
    const height = Math.max(clamp((end - start) / span), 0.012);
    placed.push({ entry, top, height: Math.min(height, 1 - top), lane: 0, lanes: 1 });
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
