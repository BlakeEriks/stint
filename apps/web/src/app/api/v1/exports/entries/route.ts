import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { csvResponse } from '@/lib/exports';
import { selectAll } from '@/lib/select-all';
import {
  CLIENT_COLUMNS,
  ENTRY_COLUMNS,
  PROJECT_COLUMNS,
  toClient,
  toEntry,
  toProject,
  type ClientRow,
  type EntryRow,
  type ProjectRow,
} from '@/lib/rows';
import { entriesCsv } from '@stint/core';
import { ExportQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/exports/entries — every finished entry, with the rate it
 * resolves to and the invoice that billed it, as CSV.
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const { tz } = parseQuery(req, ExportQuery);

  const [entries, projects, clients, invoices, settings] = await Promise.all([
    selectAll(() =>
      db
        .from('time_entries')
        .select(`${ENTRY_COLUMNS}, invoiced_elsewhere`)
        .not('ended_at', 'is', null),
    ),
    selectAll(() => db.from('projects').select(PROJECT_COLUMNS)),
    selectAll(() => db.from('clients').select(CLIENT_COLUMNS)),
    selectAll(() => db.from('invoices').select('id, invoice_number')),
    db
      .from('user_settings')
      .select('default_hourly_rate, currency')
      .maybeSingle(),
  ]);
  if (settings.error) throw settings.error;

  const csv = entriesCsv(
    {
      entries: (entries as (EntryRow & { invoiced_elsewhere: boolean })[]).map(
        (r) => ({ ...toEntry(r), invoicedElsewhere: r.invoiced_elsewhere }),
      ),
      projects: (projects as ProjectRow[]).map(toProject),
      clients: (clients as ClientRow[]).map(toClient),
      invoices: (invoices as { id: string; invoice_number: string }[]).map(
        (i) => ({ id: i.id, invoiceNumber: i.invoice_number }),
      ),
      defaultRate:
        settings.data?.default_hourly_rate == null
          ? null
          : Number(settings.data.default_hourly_rate),
      currency: settings.data?.currency ?? 'USD',
    },
    tz,
  );
  return csvResponse('entries', tz, csv);
});
