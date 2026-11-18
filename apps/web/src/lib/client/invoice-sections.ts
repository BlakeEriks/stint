import { localDateKey } from '@stint/core';
import type { Invoice } from './api';

/** A run of the invoice list under one heading. */
export interface Section {
  /** Stable across renders, so a row that changes section can be followed. */
  key: string;
  name: string;
  /** "7 paid · 1 void", for a year. */
  note?: string;
  /** Null where it would repeat the one row's amount, or would add up
      currencies that don't add. */
  total: number | null;
  /** The total's currency. */
  currency: string;
  /** Drafts and awaiting payment: what still needs the user. */
  open: boolean;
  invoices: Invoice[];
}

/** The local day an invoice reached its section: created, sent or paid.
    A void has no payment, so its issue date stands in. */
export function sectionDate(invoice: Invoice, tz: string): string {
  const at = {
    draft: invoice.createdAt,
    sent: invoice.sentAt,
    paid: invoice.paidAt,
  }[invoice.status as 'draft' | 'sent' | 'paid'];
  return at ? localDateKey(new Date(at), tz) : invoice.issueDate;
}

/** The sum in the one currency the invoices share, or null when they mix. */
function sum(invoices: Invoice[]): number | null {
  if (new Set(invoices.map((i) => i.currency)).size > 1) return null;
  return invoices.reduce((a, i) => a + i.total, 0);
}

const newestFirst = (tz: string) => (a: Invoice, b: Invoice) =>
  sectionDate(b, tz).localeCompare(sectionDate(a, tz)) ||
  (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt);

function openSection(key: string, name: string, invoices: Invoice[]): Section {
  return {
    key,
    name,
    total: invoices.length > 1 ? sum(invoices) : null,
    currency: invoices[0]?.currency ?? 'USD',
    open: true,
    invoices,
  };
}

function yearSection(year: string, invoices: Invoice[]): Section {
  const paid = invoices.filter((i) => i.status === 'paid');
  const voids = invoices.length - paid.length;
  return {
    key: `paid-${year}`,
    name: `Paid in ${year}`,
    note: `${paid.length} paid${voids ? ` · ${voids} void` : ''}`,
    // A void was never owed, so it never counts.
    total: sum(paid),
    currency: (paid[0] ?? invoices[0]!).currency,
    open: false,
    invoices,
  };
}

/** Drafts, then awaiting payment, then each year's history, newest first.
    A section with no rows is left out. */
export function invoiceSections(invoices: Invoice[], tz: string): Section[] {
  const sorted = [...invoices].sort(newestFirst(tz));
  const years = new Map<string, Invoice[]>();
  for (const i of sorted) {
    if (i.status !== 'paid' && i.status !== 'void') continue;
    const year = sectionDate(i, tz).slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), i]);
  }
  return [
    openSection(
      'draft',
      'Drafts',
      sorted.filter((i) => i.status === 'draft'),
    ),
    openSection(
      'sent',
      'Awaiting payment',
      sorted.filter((i) => i.status === 'sent'),
    ),
    ...[...years]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, rows]) => yearSection(year, rows)),
  ].filter((s) => s.invoices.length > 0);
}

/** The most recent payment, for the line that says nothing is open. */
export function lastPaid(invoices: Invoice[]): Invoice | undefined {
  return invoices
    .filter((i) => i.status === 'paid' && i.paidAt)
    .reduce<Invoice | undefined>(
      (last, i) => (!last || i.paidAt! > last.paidAt! ? i : last),
      undefined,
    );
}
