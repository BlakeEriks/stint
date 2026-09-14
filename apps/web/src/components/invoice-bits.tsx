'use client';

import type { InvoiceStatus } from '@/lib/client/api';

/* Re-exported because the invoicing components already import it from this
   module; the definition is in `@stint/core` so the PDF renders through the
   same function. */
export { formatCurrency } from '@stint/core';

/**
 * Invoice dates are plain `YYYY-MM-DD`, so they carry no zone to convert.
 *
 * Renders an em-dash rather than throwing on a missing or malformed date.
 * The schema marks these required and `POST /invoices` always sets them, so
 * a null here means data the API could not have produced — but a date is
 * *decoration* on a page whose subject is money, and taking the whole invoice
 * down to report one is the wrong trade. A dash is visibly wrong in the one
 * place that is wrong; a thrown error hides the totals, the line items and
 * every action on the document.
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
 * went wrong. Paid is cyan — the success channel — never green, which belongs
 * to the running timer.
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
