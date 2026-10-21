import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { selectAll } from '@/lib/select-all';
import { splitByLocalDay } from '@stint/core';
import { CalendarQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/calendar
 *
 * Entries grouped by local day. Grouping happens server-side so all three
 * clients agree on which day an entry belongs to — a late-night entry must
 * not land on different days on different devices.
 *
 * An entry that crosses local midnight is on every day it touches, and each day counts only its own part, so no day holds more than
 * it has.
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, CalendarQuery);

  if (new Date(q.to) < new Date(q.from)) {
    throw new ApiError('INVALID_PERIOD', '`to` must not precede `from`');
  }

  const data = await selectAll(() =>
    db
      .from('time_entries')
      .select(ENTRY_COLUMNS)
      .lt('started_at', q.to)
      .or(`ended_at.gt.${q.from},ended_at.is.null`)
      .order('started_at', { ascending: true }),
  );

  const days = new Map<
    string,
    { date: string; totalSeconds: number; entries: unknown[] }
  >();

  for (const row of data) {
    const entry = toEntry(row as EntryRow);
    /* A running entry is drawn up to now but counts nothing until it
       stops, as its duration is null until then. */
    const end = entry.endedAt ?? new Date().toISOString();
    for (const { date, seconds } of splitByLocalDay(
      new Date(entry.startedAt),
      new Date(end),
      q.tz,
    )) {
      const day = days.get(date) ?? { date, totalSeconds: 0, entries: [] };
      day.entries.push(entry);
      if (entry.endedAt != null) day.totalSeconds += seconds;
      days.set(date, day);
    }
  }

  return NextResponse.json({ days: [...days.values()] });
});
