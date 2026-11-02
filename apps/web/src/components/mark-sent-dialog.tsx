'use client';

import { Send } from 'lucide-react';
import { formatCurrency } from '@stint/core';
import { ConfirmDialog } from './confirm-dialog';

/** Mark sent's question, on the invoice page and in the Inbox. Its confirm
    says the verb of the button that opened it, so it is plainly the same
    press; the body says what that press fixes for good, how many entries
    and for how much, before it does. */
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
      description={`This records that you sent it. Its ${n} entr${n === 1 ? 'y' : 'ies'}, any expenses on it and its ${formatCurrency(invoice.total, invoice.currency)} total stop changing. To correct it later, void it and issue a new one.`}
      confirmLabel="Mark sent"
      pendingLabel="Marking sent…"
      icon={<Send aria-hidden strokeWidth={1.75} />}
      keepLabel="Keep as draft"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
