/**
 * What the detail and the PDF show. An issued invoice is read from its
 * `invoices` row and its `invoice_line_items`, and nothing else: whatever it
 * prints was stamped on the row when it was sent, so re-downloading it a year
 * later produces the same document. A draft is derived in `drafts.ts`, the
 * one place that reads live data.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { documentOpens } from '@stint/core';
import { entitlement } from './billing';
import { chosenTemplate, deriveDraft } from './drafts';
import { ApiError } from './errors';
import {
  INVOICE_COLUMNS,
  LINE_ITEM_COLUMNS,
  toInvoice,
  toLineItem,
  type InvoiceRow,
  type LineItemRow,
} from './rows';
import { selectAll } from './select-all';

/** An issued invoice's lines, FROZEN when it was sent. */
async function loadIssuedLines(db: SupabaseClient, invoiceId: string) {
  const rows = await selectAll(() =>
    db
      .from('invoice_line_items')
      .select(LINE_ITEM_COLUMNS)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true }),
  );
  return rows.map((r) => {
    const { id: _, sortOrder: __, ...line } = toLineItem(r as LineItemRow);
    return line;
  });
}

export async function loadPdfData(
  db: SupabaseClient,
  invoiceId: string,
  requestTz?: string,
) {
  const { data: stored, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw error;
  if (!stored) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');
  const row = stored as InvoiceRow;

  const [billing, draft, template] = await Promise.all([
    entitlement(db),
    deriveDraft(db, row, requestTz),
    // A draft prints in the template picked now; a sent one in its own.
    row.status === 'draft' ? chosenTemplate(db) : row.template,
  ]);
  const canDownload = documentOpens(
    billing.available,
    billing.plan,
    row.issued_subscription_status,
  );
  const invoice = toInvoice(draft?.row ?? row);
  const lineItems = draft
    ? draft.lines.map(
        ({ description, unit, quantity, unitPrice, amount, spentOn }) => ({
          description,
          unit,
          quantity,
          unitPrice,
          amount,
          spentOn: spentOn ?? null,
        }),
      )
    : await loadIssuedLines(db, invoiceId);

  return {
    invoice,
    canDownload,
    draft,
    pdfData: {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      currency: invoice.currency,
      subtotal: invoice.subtotal ?? 0,
      taxRate: invoice.taxRate ?? 0,
      taxAmount: invoice.taxAmount ?? 0,
      expensesSubtotal: invoice.expensesSubtotal ?? 0,
      total: invoice.total ?? 0,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      reference: invoice.reference,
      // The FROZEN snapshots, never a live lookup: a re-downloaded invoice
      // must show the details the client was actually given.
      business: invoice.business,
      client: invoice.billTo,
      lineItems,
      payment: invoice.paymentDetails ?? null,
      supportingDetail: invoice.supportingDetail,
      template,
    },
  };
}
