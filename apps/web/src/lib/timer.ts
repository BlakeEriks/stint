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
