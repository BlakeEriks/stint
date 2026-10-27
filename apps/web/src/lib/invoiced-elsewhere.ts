import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';

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
    throw new ApiError(
      'ENTRY_ALREADY_INVOICED',
      'This entry is on an invoice, so it can’t be marked billed elsewhere',
    );
  }
  if (data && data.ended_at === null) {
    throw new ApiError(
      'TIMER_ALREADY_RUNNING',
      'Stop this timer before marking it billed elsewhere',
    );
  }
}
