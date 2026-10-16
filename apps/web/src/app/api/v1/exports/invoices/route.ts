import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { csvResponse } from '@/lib/exports';
import { selectAll } from '@/lib/select-all';
import {
  CLIENT_COLUMNS,
  INVOICE_COLUMNS,
  toClient,
  toInvoice,
  type ClientRow,
  type InvoiceRow,
} from '@/lib/rows';
import { invoicesCsv } from '@stint/core';
import { ExportQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** GET /api/v1/exports/invoices — every invoice, any status, as CSV. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const { tz } = parseQuery(req, ExportQuery);

  const [invoices, clients] = await Promise.all([
    selectAll(() => db.from('invoices').select(INVOICE_COLUMNS)),
    selectAll(() => db.from('clients').select(CLIENT_COLUMNS)),
  ]);

  const csv = invoicesCsv(
    {
      invoices: (invoices as InvoiceRow[]).map(toInvoice),
      clients: (clients as ClientRow[]).map(toClient),
    },
    tz,
  );
  return csvResponse('invoices', tz, csv);
});
