import { describe, expect, it } from 'vitest';
import { invoiceSections, lastPaid } from '@/lib/client/invoice-sections';
import type { Invoice } from '@/lib/client/api';

const tz = 'America/New_York';

function invoice(over: Partial<Invoice>): Invoice {
  return {
    id: over.invoiceNumber ?? 'i',
    clientId: 'c1',
    invoiceNumber: 'STINT-0001',
    status: 'paid',
    issueDate: '2026-09-01',
    total: 100,
    currency: 'USD',
    sentAt: null,
    paidAt: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    ...over,
  } as Invoice;
}

const shape = (invoices: Invoice[]) =>
  invoiceSections(invoices, tz).map((s) => ({
    name: s.name,
    note: s.note,
    total: s.total,
    rows: s.invoices.map((i) => i.invoiceNumber),
  }));

describe('invoiceSections', () => {
  it('orders drafts, awaiting payment, then each year newest first, and drops empty ones', () => {
    expect(
      shape([
        invoice({ invoiceNumber: 'P25', paidAt: '2025-12-20T15:00:00Z' }),
        invoice({
          invoiceNumber: 'S1',
          status: 'sent',
          sentAt: '2026-09-01T15:00:00Z',
        }),
        invoice({
          invoiceNumber: 'S2',
          status: 'sent',
          sentAt: '2026-10-01T15:00:00Z',
        }),
        invoice({ invoiceNumber: 'P26', paidAt: '2026-03-02T15:00:00Z' }),
      ]),
    ).toEqual([
      {
        name: 'Awaiting payment',
        note: undefined,
        total: 200,
        rows: ['S2', 'S1'],
      },
      { name: 'Paid in 2026', note: '1 paid', total: 100, rows: ['P26'] },
      { name: 'Paid in 2025', note: '1 paid', total: 100, rows: ['P25'] },
    ]);
  });

  /* The year is the user's: 11pm on Dec 31 in New York is already Jan 1 in
     UTC, and a void has no payment, so its issue date places it. */
  it('files paid by the local year paid, void by the year issued, and never counts a void', () => {
    expect(
      shape([
        invoice({
          invoiceNumber: 'P',
          total: 300,
          paidAt: '2027-01-01T04:00:00Z',
        }),
        invoice({
          invoiceNumber: 'V',
          status: 'void',
          total: 900,
          issueDate: '2026-06-01',
        }),
        invoice({
          invoiceNumber: 'Q',
          total: 50,
          paidAt: '2026-05-01T15:00:00Z',
        }),
      ]),
    ).toEqual([
      {
        name: 'Paid in 2026',
        note: '2 paid · 1 void',
        total: 350,
        rows: ['P', 'V', 'Q'],
      },
    ]);
  });

  /* Dollars and euros don't add: a section that mixes them shows none. */
  it('totals a section only in the one currency its invoices share', () => {
    const sections = invoiceSections(
      [
        invoice({
          invoiceNumber: 'E',
          status: 'sent',
          currency: 'EUR',
          sentAt: '2026-09-02T15:00:00Z',
        }),
        invoice({
          invoiceNumber: 'D',
          status: 'sent',
          sentAt: '2026-09-01T15:00:00Z',
        }),
        invoice({
          invoiceNumber: 'F',
          currency: 'EUR',
          paidAt: '2026-05-01T15:00:00Z',
        }),
        invoice({
          invoiceNumber: 'G',
          currency: 'EUR',
          paidAt: '2026-04-01T15:00:00Z',
        }),
      ],
      tz,
    );
    expect(sections.map((s) => [s.name, s.total, s.currency])).toEqual([
      ['Awaiting payment', null, 'EUR'],
      ['Paid in 2026', 200, 'EUR'],
    ]);
  });

  it('gives a single open row no total, since it would repeat the row', () => {
    const [drafts] = invoiceSections(
      [invoice({ status: 'draft', total: 400 })],
      tz,
    );
    expect(drafts).toMatchObject({ name: 'Drafts', total: null });
  });
});

describe('lastPaid', () => {
  it('is the latest payment, or none', () => {
    expect(
      lastPaid([
        invoice({ invoiceNumber: 'A', paidAt: '2026-05-01T15:00:00Z' }),
        invoice({ invoiceNumber: 'B', paidAt: '2026-07-01T15:00:00Z' }),
        invoice({ invoiceNumber: 'V', status: 'void' }),
      ])?.invoiceNumber,
    ).toBe('B');
    expect(lastPaid([invoice({ status: 'void' })])).toBeUndefined();
  });
});
