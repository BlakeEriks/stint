import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { csvResponse } from '@/lib/exports';
import { selectAll } from '@/lib/select-all';
import { deriveDraft } from '@/lib/invoicing';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import { invoicesCsv } from '@stint/core';
import { ExportQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** GET /api/v1/exports/invoices — every invoice, any status, as CSV; a
 *  draft as its period's work stands now. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const { tz } = parseQuery(req, ExportQuery);

  const invoices = await selectAll(() =>
    db.from('invoices').select(INVOICE_COLUMNS),
  );
  const rows = await Promise.all(
    (invoices as InvoiceRow[]).map(
      async (r) => (await deriveDraft(db, r, tz))?.row ?? r,
    ),
  );
  const csv = invoicesCsv({ invoices: rows.map(toInvoice) }, tz);
  return csvResponse('invoices', tz, csv);
});
