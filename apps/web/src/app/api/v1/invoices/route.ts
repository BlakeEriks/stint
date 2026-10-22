import { NextResponse } from 'next/server';
import {
  handle,
  ApiError,
  isEntryClaimConflict,
  isExpenseClaimConflict,
} from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  computeInvoice,
  loadPaymentProfile,
  refreshDraft,
  requireSender,
  unratedError,
} from '@/lib/invoicing';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import { buildPaymentDetails, localDateKey } from '@stint/core';
import { CreateInvoice, ListInvoicesQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListInvoicesQuery);

  let query = db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .order('sequence_no', { ascending: false })
    .limit(q.limit);

  if (q.clientId) query = query.eq('client_id', q.clientId);
  if (q.status) query = query.eq('status', q.status);

  const { data, error } = await query;
  if (error) throw error;

  // A draft's total is its period's work now. One at a time: a user holds
  // only a few, and each refresh sees what the one before it took.
  const rows: InvoiceRow[] = [];
  for (const r of data ?? [])
    rows.push((await refreshDraft(db, r as InvoiceRow, q.tz)).row);
  return NextResponse.json({ invoices: rows.map(toInvoice) });
});

/**
 * POST /api/v1/invoices
 *
 * The irreversible step. In order:
 *   1. Recompute line items from database-resolved rates and the stored
 *      expenses (never trusting a preview the client may have cached).
 *   2. Refuse if any billable entry has no resolvable rate.
 *   3. Write it all through `create_invoice`, in one transaction: the gapless
 *      number, the invoice, its frozen lines, and the entries and expenses it
 *      bills. Attaching locks them via the immutability triggers.
 *
 * One transaction is the point of step 3. Allocating a number is not
 * undoable, so a failure after a separate allocation left a gap in a
 * sequence promised to have none — and an entry or expense another invoice
 * took in the meantime is exactly such a failure.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateInvoice);

  if (body.periodEnd < body.periodStart) {
    throw new ApiError(
      'INVALID_PERIOD',
      '`periodEnd` must not precede `periodStart`',
    );
  }

  const computed = await computeInvoice(db, {
    clientId: body.clientId,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    tz: body.tz,
    groupingMode: body.groupingMode,
    summaryText: body.summaryText,
    manualLines: body.manualLines,
    excludedExpenseIds: body.excludedExpenseIds,
    schedules: body.schedules,
  });
  const { client, settings, totals } = computed;

  requireSender(settings);

  /* One open draft per client and date: two would each claim the same new
     work on their next refresh. */
  const { data: open, error: openError } = await db
    .from('invoices')
    .select('id, invoice_number, period_start, period_end')
    .eq('client_id', body.clientId)
    .eq('status', 'draft')
    .lte('period_start', body.periodEnd)
    .gte('period_end', body.periodStart)
    .limit(1)
    .maybeSingle();
  if (openError) throw openError;
  if (open)
    throw new ApiError(
      'DRAFT_OVERLAPS',
      `${open.invoice_number} is a draft for these dates already. Open it, or start after it.`,
      {
        invoiceId: open.id,
        invoiceNumber: open.invoice_number,
        periodStart: open.period_start,
        periodEnd: open.period_end,
      },
    );

  if (totals.unratedEntryIds.length > 0)
    throw unratedError(totals.unratedEntryIds);

  // A fee or an expense alone is a valid invoice — a deposit before any work
  // is done is the ordinary case — so this asks for LINES, not for time.
  if (totals.lineItems.length === 0) {
    throw new ApiError(
      'INVALID_PERIOD',
      'Nothing to invoice: no unbilled, billable time in this period, no unbilled expenses, and no charges added',
      { periodStart: body.periodStart, periodEnd: body.periodEnd },
    );
  }

  // Frozen alongside the rates: if the profile changes or is deleted later,
  // an issued invoice must still show what the client was actually given.
  // Rendered before the number exists, so `create_invoice` appends the
  // payment reference once it has allocated one.
  const profile = await loadPaymentProfile(
    db,
    client.payment_profile_id,
    body.paymentProfileId,
  );
  const paymentDetails = buildPaymentDetails(profile);

  const { data, error } = await db.rpc('create_invoice', {
    p_user_id: userId,
    p_invoice: {
      client_id: body.clientId,
      issue_date: body.issueDate ?? localDateKey(new Date(), body.tz),
      due_date: body.dueDate ?? null,
      period_start: body.periodStart,
      period_end: body.periodEnd,
      subtotal: totals.subtotal,
      tax_rate: totals.taxRate,
      tax_amount: totals.taxAmount,
      expenses_subtotal: totals.expensesSubtotal,
      total: totals.total,
      currency: client.currency ?? settings.currency,
      notes: body.notes ?? null,
      payment_terms: body.paymentTerms ?? settings.defaultPaymentTerms,
      grouping_mode: body.groupingMode,
      summary_text: body.groupingMode === 'summary' ? body.summaryText : null,
      supporting_detail: computed.supportingDetail,
      reference: body.reference ?? null,
      payment_details: paymentDetails,
      tz: body.tz,
      excluded_expense_ids: body.excludedExpenseIds,
      lines: computed.lines,
    },
    p_entry_ids: computed.entryIds,
    p_expense_ids: computed.expenseIds,
  });

  if (error) {
    if (isExpenseClaimConflict(error)) {
      throw new ApiError(
        'EXPENSE_ALREADY_INVOICED',
        'An expense on this invoice was billed on another one first. Preview again.',
      );
    }
    if (isEntryClaimConflict(error)) {
      throw new ApiError(
        'ENTRY_ALREADY_INVOICED',
        'Time on this invoice changed since the preview. Preview again.',
      );
    }
    throw error;
  }

  const invoice = Array.isArray(data) ? data[0] : data;

  return NextResponse.json(
    {
      ...toInvoice(invoice as InvoiceRow),
      lineItems: totals.lineItems,
      entryCount: totals.entryCount,
    },
    { status: 201 },
  );
});
