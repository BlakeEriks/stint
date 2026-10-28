import { localDateKey, startOfLocalDayOffset } from '@stint/core';
import type { QueryKey } from '@tanstack/react-query';
import type { CalendarDay, TimeEntry } from './api';

/** What the editor sends to create an entry. */
export interface CreatedEntry {
  id: string;
  taskName: string;
  projectId: string | null;
  startedAt: string;
  endedAt: string;
  isBillable: boolean;
}

/**
 * A cached list or calendar week with `created` added where it belongs:
 * a list whose range holds its start, or its day in the week that holds it,
 * that day's total counting it. Anything else comes back as it was.
 */
export function predictCreatedEntry(
  current: unknown,
  created: CreatedEntry,
  key: QueryKey,
  tz: string,
): unknown {
  const start = new Date(created.startedAt).getTime();
  const seconds = Math.round(
    (new Date(created.endedAt).getTime() - start) / 1000,
  );
  const entry: TimeEntry = {
    ...created,
    durationSeconds: seconds,
    invoiceId: null,
    rateOverride: null,
    durationOk: false,
    invoicedElsewhere: false,
  };

  if (has(current, 'entries') && key[0] === 'entries')
    return intoList(current, entry, key[1]);
  if (has(current, 'days') && key[0] === 'calendar')
    return intoWeek(current, entry, String(key[1]), tz);
  return current;
}

const has = <K extends string>(
  v: unknown,
  field: K,
): v is Record<K, unknown[]> =>
  typeof v === 'object' &&
  v !== null &&
  Array.isArray((v as Record<string, unknown>)[field]);

/** A list whose range holds the entry's start gets it. */
function intoList(
  current: Record<'entries', unknown[]>,
  entry: TimeEntry,
  range: unknown,
) {
  if (typeof range !== 'object' || range === null) return current;
  const { from, to } = range as { from?: string; to?: string };
  const start = new Date(entry.startedAt).getTime();
  const within =
    (!from || new Date(from).getTime() <= start) &&
    (!to || start < new Date(to).getTime());
  return within
    ? { ...current, entries: [...current.entries, entry] }
    : current;
}

/** The week that holds the entry gets it on its day, counted in the total. */
function intoWeek(
  current: Record<'days', unknown[]>,
  entry: TimeEntry,
  weekStartIso: string,
  tz: string,
) {
  const start = new Date(entry.startedAt);
  const weekStart = new Date(weekStartIso);
  const weekEnd = startOfLocalDayOffset(weekStart, tz, -7);
  if (start < weekStart || start >= weekEnd) return current;
  const date = localDateKey(start, tz);
  const seconds = entry.durationSeconds ?? 0;
  const days = current.days as CalendarDay[];
  const add = (d: CalendarDay) => ({
    ...d,
    totalSeconds: d.totalSeconds + seconds,
    entries: [...d.entries, entry],
  });
  return {
    ...current,
    days: days.some((d) => d.date === date)
      ? days.map((d) => (d.date === date ? add(d) : d))
      : [...days, add({ date, totalSeconds: 0, entries: [] })],
  };
}
