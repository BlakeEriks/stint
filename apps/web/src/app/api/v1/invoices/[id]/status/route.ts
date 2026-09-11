import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { INVOICE_COLUMNS, toInvoice, assertTransition } from '@/lib/invoicing';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const UpdateStatus = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'void']),
  /** Record that the invoice went out earlier than now. */
  sentAt: z.iso.datetime({ offset: true }).optional(),
  /** Record a payment that arrived earlier than now. */
  paidAt: z.iso.datetime({ offset: true }).optional(),
});

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
 *
 * Voiding releases the entries so they can be re-billed on a corrected
 * invoice, while the voided number stays on record to keep numbering gapless.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, UpdateStatus);

  const { data: current, error } = await db
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!current) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  assertTransition(current.status as string, body.status);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: body.status };
  if (body.status === 'sent') update.sent_at = body.sentAt ?? now;
  if (body.status === 'paid') update.paid_at = body.paidAt ?? now;

  const { data, error: updateError } = await db
    .from('invoices')
    .update(update)
    .eq('id', id)
    .select(INVOICE_COLUMNS)
    .maybeSingle();

  if (updateError) throw updateError;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  // A voided invoice releases its entries so they can be re-billed.
  if (body.status === 'void') {
    const { error: releaseError } = await db
      .from('time_entries')
      .update({ invoice_id: null })
      .eq('invoice_id', id);
    if (releaseError) throw releaseError;
  }

  return NextResponse.json(toInvoice(data));
});
