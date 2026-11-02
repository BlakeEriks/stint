import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { deriveDraft, holdNewWork } from '@/lib/drafts';
import { INVOICE_COLUMNS, type InvoiceRow } from '@/lib/rows';
import { InvoiceReadQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/invoices/:id/work — Add to draft: the draft holds the work
 * in its period that it doesn't, all of it in one press. A draft changes
 * only when the owner asks, so this is the one way new work joins it besides
 * saving its edit.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const { tz } = parseQuery(req, InvoiceReadQuery);

  const { data, error } = await db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Invoice not found');

  const draft = await deriveDraft(db, data as InvoiceRow, tz);
  if (!draft)
    throw new ApiError(
      'INVOICE_STATUS_CHANGED',
      'Only a draft can take new work',
      { from: data.status },
    );
  await holdNewWork(db, draft);
  return new NextResponse(null, { status: 204 });
});
