import type { SupabaseClient } from '@supabase/supabase-js';
import { refusals } from '@stint/core';
import { dbCode, refused } from './errors';
import { toExpense, type ExpenseRow, type InvoiceRow } from './rows';

type InvoiceRef = Pick<InvoiceRow, 'id' | 'invoice_number' | 'status'>;

/**
 * Expense rows as the API returns them, each with its billing invoice's
 * number and status — the list says where an expense went, and the status is
 * what decides whether it can still change.
 */
export async function withInvoices(db: SupabaseClient, rows: ExpenseRow[]) {
  const ids = [
    ...new Set(rows.map((r) => r.invoice_id).filter((id) => id != null)),
  ];
  const byId = new Map<string, InvoiceRef>();
  if (ids.length) {
    const { data, error } = await db
      .from('invoices')
      .select('id, invoice_number, status')
      .in('id', ids);
    if (error) throw error;
    for (const inv of (data ?? []) as InvoiceRef[]) byId.set(inv.id, inv);
  }
  return rows.map((r) =>
    toExpense(r, r.invoice_id ? byId.get(r.invoice_id) : undefined),
  );
}

/**
 * The database errors an expense write can meet, as the API's own. The lock
 * is a trigger, so it holds on every path; this only names it.
 */
export function expenseWriteError(
  error: { code?: string; message?: string; hint?: string },
  verb: 'modified' | 'deleted',
): Error {
  if (dbCode(error) === 'EXPENSE_LOCKED')
    return refused(refusals.expenseLocked(verb));
  // A client that is not the caller's fails the same-owner key.
  if (dbCode(error) === 'VALIDATION_FAILED')
    return refused({
      ...refusals.noSuchClient,
      details: { constraint: error.message },
    });
  if (/expense_dated/.test(error.message ?? ''))
    return refused(refusals.undatedOneOff);
  if (/recurring_never_billed/.test(error.message ?? ''))
    return refused(refusals.billedRecurring);
  return error as Error;
}
