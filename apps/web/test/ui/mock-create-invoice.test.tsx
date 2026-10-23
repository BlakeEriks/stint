import { beforeEach, expect, test } from 'vitest';
import { addDays, localDateKey } from '@stint/core';
import { getDb, resetDb } from '@/mocks/db';
import { ids } from '@/mocks/fixtures';
import { handlers } from '@/mocks/handlers';
import { NOW, ZONE } from '@/mocks/time.mts';

beforeEach(() => resetDb(new Date(NOW)));

const create = async (extra: Record<string, unknown>) => {
  const res: Response = await (handlers.createInvoice as any).resolver({
    request: new Request('http://t/api/v1/invoices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: ids.northwind,
        periodStart: '2026-08-01',
        periodEnd: '2026-09-17',
        tz: ZONE,
        ...extra,
      }),
    }),
    params: {},
  });
  return { status: res.status, body: await res.json() };
};

test('refuses archived payment details', async () => {
  const profile = getDb().paymentProfiles[0]!;
  profile.archivedAt = NOW;
  const res = await create({ paymentProfileId: profile.id });
  expect(res.status).toBe(422);
  expect(res.body.message).toBe(
    'Those payment details are archived or gone. Choose others.',
  );
});

test('stores a draft and claims what it bills', async () => {
  const db = getDb();
  const next = db.settings.nextInvoiceNumber;
  const res = await create({ groupingMode: 'task', reference: '  PO-7  ' });
  expect(res.status).toBe(200);
  const invoice = res.body;
  expect(invoice).toMatchObject({
    status: 'draft',
    // Numbered at its first render, as the route's draft is.
    invoiceNumber: null,
    sequenceNo: null,
    issueDate: localDateKey(new Date(NOW), ZONE),
    // What it would take today, as the route shows it.
    dueDate: addDays(localDateKey(new Date(NOW), ZONE), 30),
    paymentTerms: 'Net 30',
    summaryText: null,
    reference: 'PO-7',
    supportingDetail: null,
  });
  expect(db.settings.nextInvoiceNumber).toBe(next);
  expect(db.invoices.at(-1)?.id).toBe(invoice.id);

  const billedEntries = invoice.lineItems.flatMap(
    (l: { entryIds: string[] }) => l.entryIds,
  );
  expect(billedEntries.length).toBeGreaterThan(0);
  for (const e of db.entries)
    expect(e.invoiceId === invoice.id).toBe(billedEntries.includes(e.id));

  const billedExpenses = invoice.lineItems
    .map((l: { expenseId?: string }) => l.expenseId)
    .filter(Boolean);
  expect(billedExpenses.length).toBeGreaterThan(0);
  for (const e of db.expenses.filter((x) => billedExpenses.includes(x.id)))
    expect(e.invoiceId).toBe(e.recurring ? null : invoice.id);
});

test('a summary keeps its text and the detail asked for', async () => {
  const res = await create({
    groupingMode: 'summary',
    summaryText: ' Consulting ',
    schedules: ['project'],
  });
  expect(res.status).toBe(200);
  expect(res.body.summaryText).toBe('Consulting');
  expect(res.body.supportingDetail).toHaveProperty('project');
});
