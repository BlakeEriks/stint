'use client';

import { api, type Invoice } from './api';
import {
  useOptimisticMutation,
  invalidateEntryData,
  keys,
} from '@stint/client';
import { useDialog } from './use-dialog';

/**
 * Mark paid, for any screen that offers it: the press opens the dialog that
 * asks when the money arrived, and spread `dialog` onto `MarkPaidDialog`.
 *
 * Pending, not predicted: the dialog stays open to say what the server
 * refused, and closes once it accepts.
 */
export function useMarkPaid() {
  const paying = useDialog<Invoice>();

  const markPaid = useOptimisticMutation({
    queryKey: () => keys.invoices(),
    inline: true,
    mutationFn: (args: { id: string; paidAt: string | undefined }) =>
      api.updateInvoiceStatus(args.id, { status: 'paid', paidAt: args.paidAt }),
    /* A paid invoice's expenses leave the client's card, and its money
       moves from outstanding to earned. */
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.invoices() }),
        qc.invalidateQueries({ queryKey: keys.expenses() }),
        invalidateEntryData(qc),
      ]),
    onSuccess: () => paying.onOpenChange(false),
  });

  const subject = paying.subject;
  return {
    show: (invoice: Invoice) => {
      // An earlier rejection must not read as a rejection of this one.
      markPaid.reset();
      paying.show(invoice);
    },
    /** Whether this invoice's payment is with the server. */
    isPending: (id: string) => markPaid.isPending && subject?.id === id,
    error: markPaid.error,
    dialog: {
      open: paying.open,
      onOpenChange: paying.onOpenChange,
      onConfirm: (paidAt: string | undefined) => {
        if (subject) markPaid.mutate({ id: subject.id, paidAt });
      },
      pending: markPaid.isPending,
      error: markPaid.error,
      sentAt: subject?.sentAt,
    },
  };
}
