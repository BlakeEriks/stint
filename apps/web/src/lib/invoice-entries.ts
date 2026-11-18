import type { SupabaseClient } from '@supabase/supabase-js';
import { entryAmount, type BillableEntry } from '@stint/core';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from './rows';
import { selectAll } from './select-all';

/** The invoice's `InvoiceEntry` list, oldest first: a draft's are the ones
    it prices (`computeInvoice`'s `entries`). */
export async function invoiceEntries(
  db: SupabaseClient,
  invoiceId: string,
  priced: BillableEntry[] | null,
) {
  const rows = await selectAll<EntryRow>(() =>
    db
      .from('time_entries')
      .select(ENTRY_COLUMNS)
      .eq(priced ? 'draft_id' : 'invoice_id', invoiceId)
      .order('started_at', { ascending: true }),
  );
  const byId = new Map(priced?.map((e) => [e.id, e]));
  const held = rows.filter((r) => !priced || byId.has(r.id));
  if (priced)
    return held.map((r) => {
      const entry = byId.get(r.id)!;
      return {
        ...toEntry(r),
        projectName: entry.projectName,
        amount: entryAmount(entry),
      };
    });
  const names = await projectNames(db, held);
  return held.map((r) => ({
    ...toEntry(r),
    projectName: names.get(r.project_id ?? '') ?? null,
  }));
}

async function projectNames(db: SupabaseClient, rows: EntryRow[]) {
  const ids = [...new Set(rows.flatMap((r) => r.project_id ?? []))];
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await db
    .from('projects')
    .select('id, name')
    .in('id', ids);
  if (error) throw error;
  return new Map(data.map((p) => [p.id as string, p.name as string]));
}
