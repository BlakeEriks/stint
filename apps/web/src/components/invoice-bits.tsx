'use client';

import type { InvoiceStatus } from '@/lib/client/api';

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
