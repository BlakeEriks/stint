import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { localDateKey, isValidTimeZone } from '@stint/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Query = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  tz: z.string().default('UTC'),
});

/**
 * GET /api/v1/calendar
 *
 * Entries grouped by local day. Grouping happens server-side so all three
 * clients agree on which day an entry belongs to — a late-night entry must
 * not land on different days on different devices.
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, Query);
  const tz = isValidTimeZone(q.tz) ? q.tz : 'UTC';

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

  const days = new Map<string, { date: string; totalSeconds: number; entries: unknown[] }>();

  for (const row of data ?? []) {
    const entry = toEntry(row as EntryRow);
    const key = localDateKey(new Date(entry.startedAt), tz);
    const day = days.get(key) ?? { date: key, totalSeconds: 0, entries: [] };
    day.entries.push(entry);
    day.totalSeconds += entry.durationSeconds ?? 0;
    days.set(key, day);
  }

  return NextResponse.json({ days: [...days.values()] });
});
