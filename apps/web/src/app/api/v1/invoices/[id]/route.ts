import { NextResponse } from 'next/server';
import {
  handle,
  ApiError,
  dbCode,
  isCheckViolation,
  PG,
  refused,
} from '@/lib/errors';
import {
  buildPaymentDetails,
  invoiceRequestRefusal,
  localDateKey,
  pricedInvoiceRefusal,
  refusals,
} from '@stint/core';
import { requireSession } from '@/lib/auth';
import {
  computeInvoice,
  deriveDraft,
  draftNewWork,
  draftRefusals,
  loadPaymentProfile,
  requireSender,
} from '@/lib/drafts';
import { loadPdfData } from '@/lib/issued';
import { parseBody, parseQuery } from '@/lib/validate';
import { toInvoice, type InvoiceRow } from '@/lib/rows';
import { CreateInvoice, InvoiceReadQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/invoices/:id — the invoice with its line items, and whether its
 * PDF opens for the caller, so the screen knows before a press. A draft is
 * the work it holds now: it names the entries it can't price, how many
 * entries Mark sent locks, and the work in its period it doesn't hold.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { tz } = parseQuery(req, InvoiceReadQuery);

  const { invoice, pdfData, canDownload, draft } = await loadPdfData(
    db,
    id,
    tz,
  );

  return NextResponse.json({
    ...invoice,
    canDownload,
    unratedEntries: draft?.unratedEntries ?? [],
    dueBeforeIssue: draft?.dueBeforeIssue ?? { download: false, send: false },
    refuses: draft ? draftRefusals(draft) : { download: false, send: false },
    choices: draft?.edit ?? null,
    entryCount: draft?.computed.totals.entryCount ?? null,
    newWork: draft ? await draftNewWork(db, draft) : null,
    lineItems: pdfData.lineItems,
  });
});

/**
 * PATCH /api/v1/invoices/:id — edits a draft: every choice Generate takes,
 * checked as Generate checks it, but its client, which it keeps. Its number
 * stays. Without `paymentProfileId` it keeps the payment details it has.
 * Saving is a build: the draft holds its period's work that no other draft
 * holds, as the form's preview showed it, and lets go of the rest.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, CreateInvoice);

  const { data: stored, error: readError } = await db
    .from('invoices')
    .select('client_id, status')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!stored) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');
  if (stored.status !== 'draft') throw statusChanged(stored.status);
  if (body.clientId !== stored.client_id)
    throw new ApiError(
      'VALIDATION_FAILED',
      'A draft keeps its client. Delete it and generate one for the other client.',
      { field: 'clientId' },
    );

  const computed = await computeInvoice(db, {
    clientId: body.clientId,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    tz: { device: body.tz },
    groupingMode: body.groupingMode,
    summaryText: body.summaryText,
    manualLines: body.manualLines,
    excludedExpenseIds: body.excludedExpenseIds,
    schedules: body.schedules,
    draftId: id,
  });
  const { tz } = computed;

  const asked = invoiceRequestRefusal(body, localDateKey(new Date(), tz));
  if (asked) throw refused(asked);

  requireSender(computed.settings);
  const priced = pricedInvoiceRefusal(computed.totals, body);
  if (priced) throw refused(priced);

  const { data, error } = await db.rpc('update_draft', {
    p_invoice_id: id,
    p_invoice: {
      due_date: body.dueDate ?? null,
      period_start: body.periodStart,
      period_end: body.periodEnd,
      notes: body.notes ?? null,
      grouping_mode: body.groupingMode,
      summary_text: body.groupingMode === 'summary' ? body.summaryText : null,
      supporting_detail: computed.supportingDetail,
      reference: body.reference ?? null,
      payment_details: body.paymentProfileId
        ? buildPaymentDetails(
            await loadPaymentProfile(
              db,
              computed.client.payment_profile_id,
              body.paymentProfileId,
            ),
          )
        : undefined,
      tz,
      excluded_expense_ids: body.excludedExpenseIds,
      manual_lines: body.manualLines,
      entry_ids: computed.heldEntryIds,
      expense_ids: computed.expenseIds,
    },
  });
  // Sent or deleted by another request since this one read it.
  if (dbCode(error) === 'INVOICE_STATUS_CHANGED') throw statusChanged('draft');
  if (error?.code === PG.NO_DATA_FOUND)
    throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as InvoiceRow;
  const draft = (await deriveDraft(db, row, tz))!;
  return NextResponse.json({ ...toInvoice(draft.row), lineItems: draft.lines });
});

const statusChanged = (from: string) =>
  new ApiError('INVOICE_STATUS_CHANGED', 'Only a draft can be edited', {
    from,
  });

/**
 * DELETE /api/v1/invoices/:id
 *
 * Only a draft can be deleted: `guard_issued_invoice_delete` refuses the
 * rest, which must be voided instead, so the numbering stays gapless and the
 * record of what was sent survives. Deleting a draft lets go of the work it
 * held (`on delete set null`).
 */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data: invoice, error } = await db
    .from('invoices')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!invoice) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  const { error: deleteError } = await db
    .from('invoices')
    .delete()
    .eq('id', id);
  if (isCheckViolation(deleteError)) throw refused(refusals.issuedDelete);
  if (deleteError) throw deleteError;

  return new NextResponse(null, { status: 204 });
});
