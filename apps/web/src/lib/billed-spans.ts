import type { SupabaseClient } from '@supabase/supabase-js';
import type { SpanRow } from '@stint/core';
import { selectAll } from './select-all';

/**
 * Billed entries that could overlap `spans`: every one on an invoice that
 * starts before the last of them ends and ends after the first starts. An
 * unbilled entry that overlaps billed time is about to be billed twice, so
 * the inbox and the invoice preview both check against these.
 *
 * Invoice numbers are read flat rather than embedded: the route tests' shim
 * has no PostgREST embedding.
 */
export async function loadBilledSpans(
  db: SupabaseClient,
  spans: { started_at: string; ended_at: string }[],
): Promise<SpanRow[]> {
  if (spans.length === 0) return [];
  let from = Infinity;
  let to = -Infinity;
  for (const s of spans) {
    from = Math.min(from, Date.parse(s.started_at));
    to = Math.max(to, Date.parse(s.ended_at));
  }

  const rows = await selectAll<{
    id: string;
    task_name: string;
    started_at: string;
    ended_at: string;
    invoice_id: string;
  }>(() =>
    db
      .from('time_entries')
      .select('id, task_name, started_at, ended_at, invoice_id')
      .not('invoice_id', 'is', null)
      .lt('started_at', new Date(to).toISOString())
      .gt('ended_at', new Date(from).toISOString()),
  );
  if (rows.length === 0) return [];

  const { data, error } = await db
    .from('invoices')
    .select('id, invoice_number')
    .in('id', [...new Set(rows.map((r) => r.invoice_id))]);
  if (error) throw error;
  const numbers = new Map(
    (data ?? []).map((i) => [i.id as string, i.invoice_number as string]),
  );

  return rows.map((r) => ({
    id: r.id,
    task_name: r.task_name,
    started_at: r.started_at,
    ended_at: r.ended_at,
    invoice_number: numbers.get(r.invoice_id) as string,
  }));
}
