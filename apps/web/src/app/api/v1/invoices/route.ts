import { NextResponse } from 'next/server';
import { handle, ApiError, dbCode, refused } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  computeInvoice,
  deriveDraft,
  loadPaymentProfile,
  requireSender,
} from '@/lib/drafts';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import {
  buildPaymentDetails,
  invoiceRequestRefusal,
  localDateKey,
  pricedInvoiceRefusal,
  termsForDays,
} from '@stint/core';
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

  // A draft's total is its period's work now.
  const invoices = await Promise.all(
    ((data ?? []) as InvoiceRow[]).map(async (r) =>
      toInvoice((await deriveDraft(db, r, q.tz))?.row ?? r),
    ),
  );
  return NextResponse.json({ invoices });
});

/**
 * POST /api/v1/invoices
 *
 * Allocates the number and creates the draft. In order:
 *   1. Recompute line items from database-resolved rates and the stored
 *      expenses (never trusting a preview the client may have cached).
 *   2. Refuse if any billable entry has no resolvable rate.
 *   3. Write the draft's choices and its charges through `create_invoice`,
 *      in one transaction with the gapless number. A draft claims its work
 *      only when sent.
 *
 * One transaction is the point of step 3. Allocating a number is not
 * undoable, so a failure after a separate allocation left a gap in a
 * sequence promised to have none — and a draft another Generate made over
 * the same dates meanwhile is exactly such a failure.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateInvoice);

  const asked = invoiceRequestRefusal(body, localDateKey(new Date(), body.tz));
  if (asked) throw refused(asked);

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

  const priced = pricedInvoiceRefusal(totals, body);
  if (priced) throw refused(priced);

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
      due_date: body.dueDate ?? null,
      period_start: body.periodStart,
      period_end: body.periodEnd,
      currency: client.currency ?? settings.currency,
      notes: body.notes ?? null,
      /* The terms the draft keeps: its due date follows them from the day it
         is sent, unless one was typed. */
      payment_terms: termsForDays(
        client.payment_terms_days ?? settings.paymentTermsDays,
      ),
      grouping_mode: body.groupingMode,
      summary_text: body.groupingMode === 'summary' ? body.summaryText : null,
      supporting_detail: computed.supportingDetail,
      reference: body.reference ?? null,
      payment_details: paymentDetails,
      tz: body.tz,
      excluded_expense_ids: body.excludedExpenseIds,
      manual_lines: body.manualLines,
    },
  });

  /* One open draft per client and date, which `create_invoice` holds: two
     would both show the same work. */
  if (dbCode(error) === 'DRAFT_OVERLAPS') {
    const open = JSON.parse(error!.details) as { invoiceNumber: string };
    throw new ApiError(
      'DRAFT_OVERLAPS',
      `${open.invoiceNumber} is a draft for these dates already. Open it, or start after it.`,
      open,
    );
  }
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as InvoiceRow;
  const draft = (await deriveDraft(db, row, body.tz))!;

  return NextResponse.json(
    {
      ...toInvoice(draft.row),
      lineItems: draft.lines,
      entryCount: draft.computed.totals.entryCount,
    },
    { status: 201 },
  );
});
