import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { INVOICE_COLUMNS, loadPdfData } from '@/lib/invoicing';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/invoices/:id — the invoice with its frozen line items. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { invoice, client, pdfData } = await loadPdfData(db, id);

  return NextResponse.json({
    ...invoice,
    client: { id: client.id, name: client.name, email: client.email, address: client.address },
    lineItems: pdfData.lineItems,
  });
});

/**
 * DELETE /api/v1/invoices/:id
 *
 * Only a draft can be deleted. Anything issued must be voided instead, so the
 * numbering stays gapless and the record of what was sent survives.
 * Deleting releases the entries it held.
 */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data: invoice, error } = await db
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!invoice) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  if (invoice.status !== 'draft') {
    throw new ApiError(
      'VALIDATION_FAILED',
      `A ${invoice.status} invoice cannot be deleted — void it instead, so the number stays on record`,
      { status: invoice.status },
    );
  }

  // Release the entries before deleting, or they would be orphaned by the
  // ON DELETE SET NULL without the intent being explicit.
  const { error: releaseError } = await db
    .from('time_entries')
    .update({ invoice_id: null })
    .eq('invoice_id', id);
  if (releaseError) throw releaseError;

  const { error: deleteError } = await db.from('invoices').delete().eq('id', id);
  if (deleteError) throw deleteError;

  return new NextResponse(null, { status: 204 });
});
