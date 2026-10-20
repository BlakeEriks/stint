import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { selectAll } from '@/lib/select-all';
import { dayByClient, localDateKey, splitByLocalDay } from '@stint/core';
import { CalendarQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/calendar
 *
 * Entries grouped by local day. Grouping happens server-side so all three
 * clients agree on which day an entry belongs to — a late-night entry must
 * not land on different days on different devices. That is also why the
 * activity strip reuses this endpoint rather than bucketing client-side: the
 * DST-correct grouping already lives here.
 *
 * In the entry view, an entry that crosses local midnight is on every day it
 * touches, and each day counts only its own part, so no day holds more than
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

  if (q.granularity === 'day') {
    /* Which client a day's work belongs to, so the strip can color by
       client. Fetched once for the range rather than per day. */
    const { data: projects, error: projectError } = await db
      .from('projects')
      .select('id, client_id');
    if (projectError) throw projectError;

    const clientOf = new Map(
      (projects ?? []).map((p) => [
        p.id as string,
        (p.client_id as string | null) ?? null,
      ]),
    );

    const entries = data.map((row) => toEntry(row as EntryRow));
    /* `byClient` counts billable work only, because its one reader is the
       week's bar stack and that bar's height is billable seconds; the rule
       lives in `dayByClient`, which `/stats` shares. */
    const split = dayByClient(entries, clientOf, { from: q.from, tz: q.tz });

    const days = new Map<
      string,
      { date: string; totalSeconds: number; byClient: Record<string, number> }
    >();
    for (const entry of entries) {
      // A running entry has no duration yet and contributes nothing.
      if (entry.endedAt == null) continue;
      /* Home's bars count a session whole on the day it started (FR-011,
         `revenue_by_day`). */
      if (new Date(entry.startedAt) < new Date(q.from)) continue;

      const key = localDateKey(new Date(entry.startedAt), q.tz);
      /* `totalSeconds` is unfiltered: the calendar draws a day's whole load. */
      const day = days.get(key) ?? {
        date: key,
        totalSeconds: 0,
        byClient: split.get(key) ?? {},
      };
      day.totalSeconds += entry.durationSeconds ?? 0;
      days.set(key, day);
    }

    return NextResponse.json({ days: [...days.values()] });
  }

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
