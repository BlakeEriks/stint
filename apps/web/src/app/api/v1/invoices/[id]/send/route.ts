import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { INVOICE_COLUMNS, toInvoice, loadPdfData, assertTransition } from '@/lib/invoicing';
import { composeInvoiceEmail, deliver, emailConfigured } from '@/lib/email';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const SendRequest = z.object({
  /** Overrides the client's stored address for this send only. */
  to: z.email().optional(),
  /**
   * Mark as sent without emailing — for invoices delivered by hand, or
   * before an email provider is configured.
   */
  markOnly: z.boolean().default(false),
});

/**
 * POST /api/v1/invoices/:id/send
 *
 * Renders the PDF, emails it, then moves the invoice to `sent`.
 *
 * The status change happens LAST: if delivery fails, the invoice stays in
 * draft rather than claiming it reached a client who never received it.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, SendRequest);

  const { invoice, client, settings, pdfData } = await loadPdfData(db, id);

  // Sending is an action, not an idempotent status write: re-sending an
  // already-sent invoice would email the client a second copy and overwrite
  // the original sent_at. Only a draft can be sent.
  if (invoice.status !== 'draft') {
    throw new ApiError(
      'VALIDATION_FAILED',
      `This invoice is already ${invoice.status} and cannot be sent again`,
      { status: invoice.status },
    );
  }
  assertTransition(invoice.status, 'sent');

  const recipient = body.to ?? client.email;
  let messageId: string | null = null;
  let delivered = false;

  if (!body.markOnly) {
    if (!recipient) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'This client has no email address. Add one, pass `to`, or use `markOnly` to record it as sent.',
      );
    }
    if (!emailConfigured()) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'No email provider is configured. Set EMAIL_PROVIDER and EMAIL_FROM, or use `markOnly`.',
      );
    }

    // Dynamic for the same reason as the pdf route: JSX module, deferred so
    // this handler stays directly testable.
    const { renderInvoicePdf } = await import('@/lib/invoice-pdf');
    const pdf = await renderInvoicePdf(pdfData);

    const result = await deliver(
      composeInvoiceEmail({
        to: recipient,
        from: process.env.EMAIL_FROM!,
        invoiceNumber: invoice.invoiceNumber,
        businessName: settings.businessName,
        total: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: invoice.currency || 'USD',
        }).format(invoice.total ?? 0),
        dueDate: invoice.dueDate,
        pdf,
      }),
    );

    delivered = result.delivered;
    messageId = result.messageId;
  }

  // Only now is it safe to say it was sent.
  const { data: updated, error: updateError } = await db
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .select(INVOICE_COLUMNS)
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  return NextResponse.json({
    ...toInvoice(updated as Record<string, any>),
    delivered,
    messageId,
    sentTo: body.markOnly ? null : recipient,
  });
});
