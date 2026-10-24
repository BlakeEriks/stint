import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { csvResponse } from '@/lib/exports';
import { selectAll } from '@/lib/select-all';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import { invoicesCsv } from '@stint/core';
import { ExportQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** GET /api/v1/exports/invoices — every invoice, any status, as CSV. A
    draft not yet numbered isn't an invoice yet, so it's left out. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const { tz } = parseQuery(req, ExportQuery);

  const invoices = await selectAll(() =>
    db.from('invoices').select(INVOICE_COLUMNS),
  );
  const csv = invoicesCsv(
    {
      invoices: (invoices as InvoiceRow[])
        .filter((i) => i.invoice_number !== null)
        .map((i) => ({
          ...toInvoice(i),
          invoiceNumber: i.invoice_number as string,
          sequenceNo: i.sequence_no as number,
        })),
    },
    tz,
  );
  return csvResponse('invoices', tz, csv);
});
