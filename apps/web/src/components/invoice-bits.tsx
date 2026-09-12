'use client';

import type { InvoiceStatus } from '@/lib/client/api';

/** Money is read in columns, so it is always mono and tabular. */
export function money(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount,
  );
}

/** Invoice dates are plain `YYYY-MM-DD`, so they carry no zone to convert. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(y!, m! - 1, d!));
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
