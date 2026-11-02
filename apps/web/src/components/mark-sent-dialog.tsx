'use client';

import { Lock } from 'lucide-react';
import { formatCurrency } from '@stint/core';
import { ConfirmDialog } from './confirm-dialog';

/** Mark sent's question, on the invoice page and in the Inbox. Sending locks
    the entries for good, so it says how many and for how much before it
    does. */
export function MarkSentDialog({
  open,
  onOpenChange,
  invoice,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    invoiceNumber: string;
    entryCount: number;
    total: number;
    currency: string;
  };
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}) {
  const n = invoice.entryCount;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${invoice.invoiceNumber} sent`}
      description={`Lock ${n} entr${n === 1 ? 'y' : 'ies'} · ${formatCurrency(invoice.total, invoice.currency)}. The invoice stays as it is.`}
      confirmLabel="Lock"
      pendingLabel="Locking…"
      icon={<Lock aria-hidden strokeWidth={1.75} />}
      keepLabel="Keep as draft"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
