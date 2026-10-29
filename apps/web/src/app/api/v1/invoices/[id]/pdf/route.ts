import { ApiError, handle, refused } from '@/lib/errors';
import { unratedRefusal } from '@stint/core';
import { requireSession } from '@/lib/auth';
import { recordDownload, dueBeforeIssueError } from '@/lib/drafts';
import { loadPdfData } from '@/lib/issued';
import { parseQuery } from '@/lib/validate';
import { InvoiceReadQuery } from '@stint/schema';

// Rendering needs the Node runtime, not edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/invoices/:id/pdf
 *
 * Rendered on demand — see `loadPdfData`. A draft's render is recorded, so
 * Mark sent can tell when the client was given a copy the draft has since
 * moved past; one with an entry it can't price is refused, not rendered
 * short.
 *
 * This is how an invoice reaches a client: the user downloads it and emails
 * it themselves, from their own address. `?download=1` forces a save rather
 * than a browser preview. Both are the document, so both are the paid tier:
 * gating only the download would leave the viewer's save button.
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
  if (!canDownload)
    throw new ApiError(
      'PAYMENT_REQUIRED',
      'Downloading an invoice is on the paid plan. Subscribe in Settings.',
    );
  if (draft?.unratedEntries.length)
    throw refused(unratedRefusal(draft.unratedEntries.map((e) => e.id)));
  if (draft?.dueBeforeIssue.download)
    throw dueBeforeIssueError(draft.row.issue_date, draft.row.due_date!);
  const download = new URL(req.url).searchParams.get('download') === '1';

  // Imported dynamically: the renderer module is JSX, and deferring it keeps
  // this handler loadable by the type-stripping test runner.
  const { renderInvoicePdf } = await import('@/lib/invoice-pdf');
  const bytes = await renderInvoicePdf(pdfData);
  if (draft) await recordDownload(db, id, draft.lines, pdfData);

  // Uint8Array is a valid BodyInit at runtime; the generic ArrayBufferLike
  // parameter in TS 5.7's lib types makes the overload miss.
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${invoice.invoiceNumber}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});
