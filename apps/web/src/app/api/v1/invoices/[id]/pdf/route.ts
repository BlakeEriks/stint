import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { loadPdfData } from '@/lib/invoicing';

// Rendering needs the Node runtime, not edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/invoices/:id/pdf
 *
 * Rendered on demand from the frozen line items — see `loadPdfData`.
 *
 * This is how an invoice reaches a client: the user downloads it and emails
 * it themselves, from their own address. `?download=1` forces a save rather
 * than a browser preview.
 */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { invoice, pdfData } = await loadPdfData(db, id);
  const download = new URL(req.url).searchParams.get('download') === '1';

  // Imported dynamically: the renderer module is JSX, and deferring it keeps
  // this handler loadable by the type-stripping test runner.
  const { renderInvoicePdf } = await import('@/lib/invoice-pdf');
  const bytes = await renderInvoicePdf(pdfData);

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
