'use client';

import { keys } from '@stint/client';
import { attachedSchedules, isPeriod } from '@stint/core';
import { api, type Invoice, type InvoiceStatus } from '@/lib/client/api';

/**
 * Invoice dates are plain `YYYY-MM-DD`, so they carry no zone to convert.
 *
 * Renders an em-dash rather than throwing on a missing or malformed date: a
 * date is decoration on a page whose subject is money, and a thrown error
 * would hide the totals, the line items and every action on the document.
 */
export function shortDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(y, m - 1, d));
}

/**
 * Status is neutral except `void`, which is the only one that means something
 * went wrong, and `paid`, which is the outcome the whole record exists to
 * reach. Paid takes the success green — the accent hue a step down, so it
 * reads as the same family as the button that set it without competing with
 * a running timer.
 */
const TONE: Record<InvoiceStatus, string> = {
  draft: 'border-edge-default text-subtle',
  sent: 'border-edge-control text-muted',
  paid: 'border-success text-success',
  void: 'border-edge-default text-subtle line-through',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`flex-none rounded border px-1.5 py-px type-badge ${TONE[status]}`}
    >
      {status}
    </span>
  );
}

/** New invoice with a client and period filled in, as `linkedDraft`
 *  (`invoice-new.tsx`) reads it. */
export function newInvoiceHref(d: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
}) {
  return `/invoices/new?${new URLSearchParams({
    client: d.clientId,
    from: d.periodStart,
    to: d.periodEnd,
  })}`;
}

/** A calendar month by its name, any other period by its dates:
 *  "Oct 1 – 15", "Sep 28 – Oct 4". */
export function periodName(start: string, end: string) {
  const date = (d: string, parts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...parts, timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );
  if (isPeriod({ period: 'monthly' }, start, end))
    return date(start, { month: 'long' });
  const short = { month: 'short', day: 'numeric' } as const;
  const to =
    start.slice(0, 7) === end.slice(0, 7)
      ? date(end, { day: 'numeric' })
      : date(end, short);
  return `${date(start, short)} – ${to}`;
}

/** A client's newest invoice that isn't void, which the next one carries
 *  from. Shared, so a ready row and New invoice ask once. */
export const lastInvoiceQuery = (clientId: string) => ({
  queryKey: [...keys.invoices(), { clientId }],
  // Newest first.
  queryFn: () => api.invoices({ clientId }),
  enabled: clientId !== '',
  select: (r: Awaited<ReturnType<typeof api.invoices>>) =>
    r.invoices.find((i) => i.status !== 'void'),
});

/** What a client's last invoice carries into the next, so a monthly invoice
 *  isn't retyped. A first invoice is one summary line: itemizing is the
 *  exception. Its text starts shown in the field, so it is the user's to
 *  change, never filled in at save. */
export const carriedFrom = (last: Invoice | undefined) => ({
  groupingMode: last?.groupingMode ?? 'summary',
  summaryText: last?.summaryText ?? 'Contracting services',
  schedules: attachedSchedules(last?.supportingDetail ?? null),
  reference: last?.reference ?? '',
});
