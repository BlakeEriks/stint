import type { SupabaseClient } from '@supabase/supabase-js';
import { refusals } from '@stint/core';
import { refused } from './errors';

interface Filterable<T> {
  is(column: string, value: null): T;
  not(column: string, operator: string, value: unknown): T;
}

/** The entries a mark may reach: finished and on no invoice. */
export function markable<T extends Filterable<T>>(q: T): T {
  return q.is('invoice_id', null).not('ended_at', 'is', null);
}

/** Why `markable` filtered out the one entry a PATCH named, as a 409. A
 *  missing entry returns, for the route's own 404. */
export async function refuseUnmarkable(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from('time_entries')
    .select('invoice_id, ended_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (data?.invoice_id) {
    throw refused(refusals.markInvoiced);
  }
  if (data && data.ended_at === null) {
    throw refused(refusals.markRunning);
  }
}
