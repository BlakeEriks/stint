import { NextResponse } from 'next/server';
import { handle, ApiError, isCheckViolation } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import { UpdateInvoiceStatus } from '@stint/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/* A user-supplied date is a record of when money actually arrived, not a
   free-text field — it cannot predate the invoice being sent (paid before it
   was even delivered) or postdate the moment of the request (a payment that
   has not happened yet). */
function assertPaidAt(paidAt: string, sentAt: string | null, now: Date) {
  const paid = new Date(paidAt).getTime();
  if (paid > now.getTime()) {
    throw new ApiError('VALIDATION_FAILED', 'paidAt cannot be in the future', {
      paidAt,
    });
  }
  if (sentAt && paid < new Date(sentAt).getTime()) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'paidAt cannot be earlier than the invoice was sent',
      { paidAt, sentAt },
    );
  }
}

/**
 * PATCH /api/v1/invoices/:id/status
 *
 * This is also how an invoice is marked sent. The app does not email
 * invoices — you download the PDF and send it yourself, from your own
 * address, then record it here.
 *
 * Transitions are constrained: draft→sent/void, sent→paid/void, paid→void.
 * Nothing returns to draft, because leaving `sent` is what locked the
 * entries — reopening would let billed time change after the client saw it.
 * `guard_issued_invoice` holds the table, for this route and any write that
 * skips it. The update only lands on the status it read, so of two
 * overlapping requests the later is refused rather than absorbed.
 *
 * Voiding releases the entries and expenses so they can be re-billed on a
 * corrected invoice, while the voided number stays on record to keep
 * numbering gapless. `release_voided_invoice` does it in the voiding update.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, UpdateInvoiceStatus);

  const { data: current, error } = await db
    .from('invoices')
    .select('id, status, sent_at')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!current) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  const now = new Date();
  if (body.status === 'paid' && body.paidAt)
    assertPaidAt(body.paidAt, current.sent_at as string | null, now);

  const update: Record<string, unknown> = { status: body.status };
  if (body.status === 'sent') update.sent_at = body.sentAt ?? now.toISOString();
  if (body.status === 'paid') update.paid_at = body.paidAt ?? now.toISOString();

  const { data, error: updateError } = await db
    .from('invoices')
    .update(update)
    .eq('id', id)
    .eq('status', current.status)
    .select(INVOICE_COLUMNS)
    .maybeSingle();

  if (isCheckViolation(updateError))
    throw new ApiError(
      'VALIDATION_FAILED',
      `An invoice cannot move from ${current.status} to ${body.status}`,
      { from: current.status, to: body.status },
    );
  if (updateError) throw updateError;
  if (!data)
    throw new ApiError(
      'INVOICE_STATUS_CHANGED',
      'The invoice changed status since it was read',
      { from: current.status },
    );

  return NextResponse.json(toInvoice(data as InvoiceRow));
});
