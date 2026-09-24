import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { localDateKey } from '@stint/core';
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
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, CalendarQuery);

  if (new Date(q.to) < new Date(q.from)) {
    throw new ApiError('INVALID_PERIOD', '`to` must not precede `from`');
  }

  const { data, error } = await db
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .gte('started_at', q.from)
    .lte('started_at', q.to)
    .order('started_at', { ascending: true });

  if (error) throw error;

  if (q.granularity === 'day') {
    /* Which client a day's work belongs to, so the strip can colour by
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

    const days = new Map<
      string,
      { date: string; totalSeconds: number; byClient: Record<string, number> }
    >();

    for (const row of data ?? []) {
      const entry = toEntry(row as EntryRow);
      // A running entry has no duration yet and contributes nothing.
      if (entry.endedAt == null) continue;

      const key = localDateKey(new Date(entry.startedAt), q.tz);
      const day = days.get(key) ?? {
        date: key,
        totalSeconds: 0,
        byClient: {},
      };
      const seconds = entry.durationSeconds ?? 0;
      day.totalSeconds += seconds;

      /* `byClient` counts BILLABLE work only, because its one reader is the
         week's bar stack and that bar's height is billable seconds
         (`revenue_by_day`). Splitting a billable height by every client who
         worked would give non-billable work a share of a bar it did not
         raise. `totalSeconds` is unfiltered and stays that way: the calendar
         draws a day's whole load. */
      if (entry.isBillable) {
        /* Internal work keys as the empty string rather than being dropped: a
           day spent on unbilled work is not an empty day, and the strip must
           be able to show it. */
        const client = entry.projectId
          ? (clientOf.get(entry.projectId) ?? '')
          : '';
        day.byClient[client] = (day.byClient[client] ?? 0) + seconds;
      }
      days.set(key, day);
    }

    return NextResponse.json({ days: [...days.values()] });
  }

  const days = new Map<
    string,
    { date: string; totalSeconds: number; entries: unknown[] }
  >();

  for (const row of data ?? []) {
    const entry = toEntry(row as EntryRow);
    const key = localDateKey(new Date(entry.startedAt), q.tz);
    const day = days.get(key) ?? { date: key, totalSeconds: 0, entries: [] };
    day.entries.push(entry);
    day.totalSeconds += entry.durationSeconds ?? 0;
    days.set(key, day);
  }

  return NextResponse.json({ days: [...days.values()] });
});
