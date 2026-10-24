import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { createDraft, refreshDraft, withDraftDates } from '@/lib/invoicing';
import { INVOICE_COLUMNS, toInvoice, type InvoiceRow } from '@/lib/rows';
import { CreateInvoice, ListInvoicesQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListInvoicesQuery);

  let query = db
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .order('sequence_no', { ascending: false })
    .limit(q.limit);

  if (q.clientId) query = query.eq('client_id', q.clientId);
  if (q.status) query = query.eq('status', q.status);

  const { data, error } = await query;
  if (error) throw error;

  // A draft's total is its period's work now. One at a time: a user holds
  // only a few, and each refresh sees what the one before it took.
  const rows: InvoiceRow[] = [];
  for (const r of data ?? [])
    rows.push((await refreshDraft(db, r as InvoiceRow, q.tz)).row);
  return NextResponse.json({ invoices: rows.map(toInvoice) });
});

/**
 * POST /api/v1/invoices: a draft, through `createDraft()`, as the daily job
 * makes its own.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateInvoice);
  const { row, lineItems, entryCount } = await createDraft(db, userId, body);
  return NextResponse.json(
    {
      ...toInvoice(await withDraftDates(db, row, body.tz)),
      lineItems,
      entryCount,
    },
    { status: 201 },
  );
});
