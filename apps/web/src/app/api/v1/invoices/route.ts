import { NextResponse } from 'next/server';
import { handle, ApiError, isExpenseClaimConflict } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  loadClient,
  loadSettings,
  loadBillableEntries,
  loadPaymentProfile,
  loadBillableExpenses,
} from '@/lib/invoicing';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import { buildLineItems, buildPaymentDetails } from '@stint/core';
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

  return NextResponse.json({
    invoices: (data ?? []).map((r) => toInvoice(r as InvoiceRow)),
  });
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
 * sequence promised to have none — and an expense another invoice took in
 * the meantime is exactly such a failure.
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

  const [client, settings] = await Promise.all([
    loadClient(db, body.clientId),
    loadSettings(db),
  ]);

  const clientRate =
    client.hourly_rate == null ? null : Number(client.hourly_rate);
  const taxRate = client.tax_rate == null ? 0 : Number(client.tax_rate);

  const [entries, expenses] = await Promise.all([
    loadBillableEntries(db, {
      clientId: body.clientId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      tz: body.tz,
      userDefaultRate: settings.defaultHourlyRate,
      clientRate,
    }),
    loadBillableExpenses(db, {
      clientId: body.clientId,
      periodEnd: body.periodEnd,
      excludedIds: body.excludedExpenseIds,
    }),
  ]);

  const totals = buildLineItems(entries, {
    groupingMode: body.groupingMode,
    taxRate,
    tz: body.tz,
    manualLines: body.manualLines,
    expenses,
  });

  if (totals.unratedEntryIds.length > 0) {
    throw new ApiError(
      'NO_RATE_CONFIGURED',
      `${totals.unratedEntryIds.length} billable entr${
        totals.unratedEntryIds.length === 1 ? 'y has' : 'ies have'
      } no rate. Set a rate on the entry, project, client, or in settings.`,
      { unratedEntryIds: totals.unratedEntryIds },
    );
  }

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
  const profile = await loadPaymentProfile(db, client.payment_profile_id);
  const paymentDetails = buildPaymentDetails(profile);

  const { data, error } = await db.rpc('create_invoice', {
    p_user_id: userId,
    p_invoice: {
      client_id: body.clientId,
      issue_date: body.issueDate ?? new Date().toISOString().slice(0, 10),
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
      payment_details: paymentDetails,
      // Frozen lines: an issued invoice is a financial record, not a live
      // view over time entries and expenses.
      lines: totals.lineItems.map((li) => ({
        description: li.description,
        unit: li.unit,
        quantity: li.quantity,
        unit_price: li.unitPrice,
        amount: li.amount,
        spent_on: li.spentOn ?? null,
      })),
    },
    p_entry_ids: totals.lineItems.flatMap((li) => li.entryIds),
    // One-offs only: a recurring expense is frozen onto this invoice but
    // stays unattached, to bill again on the next.
    p_expense_ids: expenses.filter((e) => !e.recurring).map((e) => e.id),
  });

  if (error) {
    if (isExpenseClaimConflict(error)) {
      throw new ApiError(
        'EXPENSE_ALREADY_INVOICED',
        'An expense on this invoice was billed on another one first. Preview again.',
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
