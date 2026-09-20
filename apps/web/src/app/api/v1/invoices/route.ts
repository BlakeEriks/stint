import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  loadClient,
  loadSettings,
  loadBillableEntries,
  loadPaymentProfile,
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
 *   1. Recompute line items from database-resolved rates (never trusting a
 *      preview the client may have cached).
 *   2. Refuse if any billable entry has no resolvable rate.
 *   3. Allocate a gapless number under a row lock.
 *   4. Write the invoice, then its frozen line items.
 *   5. Attach the entries, which locks them via the immutability trigger.
 *
 * Step 5 is last on purpose: if attachment fails, the invoice is rolled back
 * rather than leaving entries pointing at a half-written record.
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

  const entries = await loadBillableEntries(db, {
    clientId: body.clientId,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    tz: body.tz,
    userDefaultRate: settings.defaultHourlyRate,
    clientRate,
  });

  const totals = buildLineItems(entries, {
    groupingMode: body.groupingMode,
    taxRate,
    tz: body.tz,
    manualLines: body.manualLines,
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

  // A fee alone is a valid invoice — a deposit before any work is done is
  // the ordinary case — so this asks for LINES, not for time.
  if (totals.lineItems.length === 0) {
    throw new ApiError(
      'INVALID_PERIOD',
      'Nothing to invoice: no unbilled, billable time in this period and no charges added',
      { periodStart: body.periodStart, periodEnd: body.periodEnd },
    );
  }

  // Gapless allocation happens inside the database under a row lock, so
  // concurrent requests cannot claim the same number.
  const { data: allocated, error: allocError } = await db.rpc(
    'allocate_invoice_number',
    {
      p_user_id: userId,
    },
  );
  if (allocError) throw allocError;

  const allocation = Array.isArray(allocated) ? allocated[0] : allocated;
  if (!allocation)
    throw new ApiError(
      'VALIDATION_FAILED',
      'Could not allocate an invoice number',
    );

  // Freeze the payment details alongside the rates. If the profile changes
  // or is deleted later, an issued invoice must still show what the client
  // was actually given.
  const profile = await loadPaymentProfile(db, client.payment_profile_id);
  const paymentDetails = buildPaymentDetails(profile, {
    invoiceNumber: allocation.invoice_number,
  });

  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .insert({
      user_id: userId,
      client_id: body.clientId,
      invoice_number: allocation.invoice_number,
      sequence_no: allocation.sequence_no,
      status: 'draft',
      issue_date: body.issueDate ?? new Date().toISOString().slice(0, 10),
      due_date: body.dueDate ?? null,
      period_start: body.periodStart,
      period_end: body.periodEnd,
      subtotal: totals.subtotal,
      tax_rate: totals.taxRate,
      tax_amount: totals.taxAmount,
      total: totals.total,
      currency: client.currency ?? settings.currency,
      notes: body.notes ?? null,
      payment_terms: body.paymentTerms ?? settings.defaultPaymentTerms,
      grouping_mode: body.groupingMode,
      payment_details: paymentDetails,
    })
    .select(INVOICE_COLUMNS)
    .single();

  if (invoiceError) throw invoiceError;

  const invoiceId = invoice.id as string;

  // Frozen line items: an issued invoice is a financial record, not a live
  // view over time entries.
  const { error: itemsError } = await db.from('invoice_line_items').insert(
    totals.lineItems.map((li, i) => ({
      invoice_id: invoiceId,
      description: li.description,
      unit: li.unit,
      quantity: li.quantity,
      unit_price: li.unitPrice,
      amount: li.amount,
      sort_order: i,
    })),
  );

  if (itemsError) {
    await db.from('invoices').delete().eq('id', invoiceId);
    throw itemsError;
  }

  // An invoice of only fees attaches nothing: `.in('id', [])` would be a
  // pointless round trip, and PostgREST's empty-list handling is not worth
  // depending on for a call with no work to do.
  const entryIds = totals.lineItems.flatMap((li) => li.entryIds);
  const { error: attachError } = entryIds.length
    ? await db
        .from('time_entries')
        .update({ invoice_id: invoiceId })
        .in('id', entryIds)
        .is('invoice_id', null) // never steal an entry another invoice claimed
    : { error: null };

  if (attachError) {
    await db.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
    await db.from('invoices').delete().eq('id', invoiceId);
    throw attachError;
  }

  return NextResponse.json(
    {
      ...toInvoice(invoice as InvoiceRow),
      lineItems: totals.lineItems,
      entryCount: totals.entryCount,
    },
    { status: 201 },
  );
});
