import type { SupabaseClient } from '@supabase/supabase-js';
import { entrySeconds, startOfLocalDay, startOfLocalWeek } from '@stint/core';
import { findRunning } from './timer';

/**
 * The running entry AND the day/week totals, in one read: the menu bar
 * toggles between "current timer" and "total today" and must never need a
 * second request to switch.
 *
 * Totals INCLUDE the running entry's elapsed time, so the two display
 * modes always agree with each other.
 */
export async function readSummary(db: SupabaseClient, tz: string) {
  const now = new Date();

  const { data: settings } = await db
    .from('user_settings')
    .select('week_starts_on')
    .maybeSingle();

  const weekStartsOn = settings?.week_starts_on ?? 1;

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
  const liveSeconds = running ? entrySeconds(running.startedAt, now) : 0;
  if (running) {
    weekSeconds += liveSeconds;
    if (new Date(running.startedAt) >= dayStart) todaySeconds += liveSeconds;
  }

  return {
    running,
    todaySeconds,
    weekSeconds,
    serverTime: now.toISOString(),
  };
}
