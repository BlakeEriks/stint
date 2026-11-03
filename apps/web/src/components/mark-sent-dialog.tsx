'use client';

import { Send } from 'lucide-react';
import { formatCurrency } from '@stint/core';
import { ConfirmDialog } from './confirm-dialog';

/** "1 entry", "14 entries". */
export const entries = (n: number) => `${n} entr${n === 1 ? 'y' : 'ies'}`;

type Sending = {
  invoiceNumber: string;
  entryCount: number;
  total: number;
  currency: string;
};

/** Mark sent's question, on the invoice page and in the Inbox. Its confirm
    says the verb of the button that opened it, so it is plainly the same
    press; the body says what that press fixes for good, how many entries
    and for how much, before it does. */
export const markSentAsk = (invoice: Sending) => ({
  title: `Mark ${invoice.invoiceNumber} sent`,
  description: `This records that you sent it. Its ${entries(invoice.entryCount)}, any expenses on it and its ${formatCurrency(invoice.total, invoice.currency)} total stop changing. To correct it later, void it and issue a new one.`,
  confirmLabel: 'Mark sent',
  pendingLabel: 'Marking sent…',
  icon: <Send aria-hidden strokeWidth={1.75} />,
  keepLabel: 'Keep as draft',
});

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
  invoice: Sending;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      {...markSentAsk(invoice)}
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
