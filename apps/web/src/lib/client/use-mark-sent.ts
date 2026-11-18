'use client';

import { useQuery } from '@tanstack/react-query';
import {
  useOptimisticMutation,
  invalidateEntryData,
  keys,
} from '@stint/client';
import { api, type Invoice } from './api';
import { forgetInvoice } from './prefetch-invoices';
import { useDialog } from './use-dialog';

/**
 * Mark sent from a row: the press opens `MarkSentDialog`, and spread
 * `dialog` onto it. Pending, not predicted, as `useMarkPaid` is.
 *
 * The dialog counts the entries it locks, which the list doesn't carry, so
 * it reads the draft in full: `usePrefetchInvoices` has usually fetched it.
 */
export function useMarkSent() {
  const sending = useDialog<Invoice>();
  const subject = sending.subject;
  const detail = useQuery({
    queryKey: keys.invoice(subject?.id),
    queryFn: () => api.invoice(subject!.id),
    enabled: subject !== undefined,
  });

  const markSent = useOptimisticMutation({
    queryKey: () => keys.invoices(),
    inline: true,
    mutationFn: (id: string) => api.updateInvoiceStatus(id, { status: 'sent' }),
    // Sending locks its entries and expenses, so their views move too.
    invalidate: (qc, id) => {
      forgetInvoice(qc, id);
      return Promise.all([
        qc.invalidateQueries({ queryKey: keys.invoices() }),
        qc.invalidateQueries({ queryKey: keys.expenses() }),
        invalidateEntryData(qc),
      ]);
    },
    onSuccess: () => sending.onOpenChange(false),
  });

  const entryCount = detail.data?.entryCount;
  return {
    show: (invoice: Invoice) => {
      // An earlier rejection must not read as a rejection of this one.
      markSent.reset();
      sending.show(invoice);
    },
    isPending: (id: string) => markSent.isPending && subject?.id === id,
    dialog: subject && {
      open: sending.open,
      onOpenChange: sending.onOpenChange,
      invoice: { ...subject, entryCount: entryCount ?? null },
      // Held until the count it states is known.
      disabled: entryCount == null,
      pending: markSent.isPending,
      error: markSent.error ?? detail.error,
      onConfirm: () => markSent.mutate(subject.id),
    },
  };
}
