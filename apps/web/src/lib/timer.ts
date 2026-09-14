import type { SupabaseClient } from '@supabase/supabase-js';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from './rows';

/** The running entry, or null. `ended_at IS NULL` is the definition. */
export async function findRunning(db: SupabaseClient) {
  const { data, error } = await db
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .is('ended_at', null)
    .maybeSingle();

  if (error) throw error;
  return data ? toEntry(data as EntryRow) : null;
}

/**
 * Threshold for runaway-timer detection.
 *
 * The column is NOT NULL with a default and the signup trigger writes a row
 * for every user, so a signed-in caller always has one.
 */
export async function maxTimerHours(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from('user_settings')
    .select('max_timer_hours')
    .maybeSingle();

  if (error) throw error;
  return Number(data?.max_timer_hours);
}

export function exceeds(
  startedAt: string,
  hours: number,
  now = new Date(),
): boolean {
  return (now.getTime() - new Date(startedAt).getTime()) / 1000 > hours * 3600;
}
