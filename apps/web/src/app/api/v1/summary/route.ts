import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { findRunning } from '@/lib/timer';
import { z } from 'zod';
import {
  elapsedSeconds,
  startOfLocalDay,
  startOfLocalWeek,
  isValidTimeZone,
} from '@tt/core';

export const dynamic = 'force-dynamic';

const Query = z.object({
  /**
   * IANA zone, e.g. "America/Sao_Paulo". "Today" is a local-calendar
   * question and the server cannot infer the caller's zone, so the client
   * states it. Falls back to UTC rather than failing the request.
   */
  tz: z.string().default('UTC'),
});

/**
 * GET /api/v1/summary
 *
 * The macOS menu bar endpoint. Returns the running entry AND the day/week
 * totals in one call, because the menu bar toggles between "current timer"
 * and "total today" and must never need a second request to switch.
 *
 * Totals INCLUDE the running entry's elapsed time, so the two display
 * modes always agree with each other.
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, Query);
  const tz = isValidTimeZone(q.tz) ? q.tz : 'UTC';
  const now = new Date();

  const { data: settings } = await db
    .from('user_settings')
    .select('week_starts_on, max_timer_hours')
    .maybeSingle();

  const weekStartsOn = settings?.week_starts_on ?? 1;
  const maxHours = Number(settings?.max_timer_hours ?? 8);

  const dayStart = startOfLocalDay(now, tz);
  const weekStart = startOfLocalWeek(now, tz, weekStartsOn);

  const [running, weekRows] = await Promise.all([
    findRunning(db),
    db
      .from('time_entries')
      .select('started_at, duration_seconds')
      .gte('started_at', weekStart.toISOString())
      .not('duration_seconds', 'is', null),
  ]);

  if (weekRows.error) throw weekRows.error;

  let todaySeconds = 0;
  let weekSeconds = 0;
  for (const row of weekRows.data ?? []) {
    const secs = row.duration_seconds ?? 0;
    weekSeconds += secs;
    if (new Date(row.started_at) >= dayStart) todaySeconds += secs;
  }

  // Fold in the live timer so both menu bar modes stay consistent.
  const liveSeconds = running ? elapsedSeconds(running.startedAt, now) : 0;
  if (running) {
    weekSeconds += liveSeconds;
    if (new Date(running.startedAt) >= dayStart) todaySeconds += liveSeconds;
  }

  return NextResponse.json({
    running,
    todaySeconds,
    weekSeconds,
    exceedsThreshold: running ? liveSeconds > maxHours * 3600 : false,
    maxTimerHours: maxHours,
    serverTime: now.toISOString(),
  });
});
