import { NextResponse } from 'next/server';
import { handle, ApiError, isCheckViolation } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { loadPdfData } from '@/lib/invoicing';
import { parseQuery } from '@/lib/validate';
import { InvoiceReadQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/invoices/:id — the invoice with its line items, and whether its
 * PDF opens for the caller, so the screen knows before a press. A draft is
 * its period's work now: it names the entries it can't price, and says how
 * it moved since its PDF was last rendered.
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
    changedSinceDownload: draft?.change ?? null,
    unratedEntries: draft?.unratedEntries ?? [],
    dueBeforeIssue: draft?.dueBeforeIssue ?? false,
    lineItems: pdfData.lineItems.map((l, i) => ({
      ...l,
      isNew: draft?.isNew[i] ?? false,
    })),
  });
});

/**
 * DELETE /api/v1/invoices/:id
 *
 * Only a draft can be deleted: `guard_issued_invoice_delete` refuses the
 * rest, which must be voided instead, so the numbering stays gapless and the
 * record of what was sent survives. A draft claims no work, so deleting one
 * releases nothing.
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
  if (isCheckViolation(deleteError))
    throw new ApiError(
      'VALIDATION_FAILED',
      'An issued invoice cannot be deleted — void it instead, so the number stays on record',
    );
  if (deleteError) throw deleteError;

  return new NextResponse(null, { status: 204 });
});
