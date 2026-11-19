'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  useOptimisticMutation,
  keys,
  invalidateEntryData,
} from '@stint/client';
import { api, type Invoice, type InvoiceStatus } from './api';
import { useMarkPaid } from './use-mark-paid';

type Press = 'setStatus' | 'addWork' | 'remove' | 'markPaid';

/**
 * What can be done to one invoice, for its detail page. Each press replaces
 * `lastError`, so the page shows only the latest press's refusal.
 *
 * Pending, not predicted: issuing assigns the number, and voiding or
 * deleting can't be taken back.
 */
export function useInvoiceActions(id: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const [last, setLast] = useState<Press | null>(null);

  /* Voiding releases the entries and expenses and deleting a draft frees
     them, so every view of that work moves with the invoice. An action that
     leaves the page doesn't ask for this invoice again: deleted, it answers
     404 to a page still waiting on the list. */
  const refresh = (qc: QueryClient, leaving = false) =>
    Promise.all([
      qc.invalidateQueries({
        queryKey: keys.invoices(),
        predicate: (q) => !leaving || q.queryKey[1] !== id,
      }),
      qc.invalidateQueries({ queryKey: keys.expenses() }),
      invalidateEntryData(qc),
    ]);
  const press = {
    queryKey: () => keys.invoices(),
    inline: true,
    invalidate: (qc: QueryClient) => refresh(qc),
  };

  const setStatus = useOptimisticMutation({
    ...press,
    mutationFn: (args: { status: InvoiceStatus }) =>
      api.updateInvoiceStatus(id, args),
  });
  const addWork = useOptimisticMutation({
    ...press,
    mutationFn: () => api.addDraftWork(id),
  });
  const remove = useOptimisticMutation({
    ...press,
    invalidate: (qc: QueryClient) => refresh(qc, true),
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => router.push('/invoices'),
  });
  const markPaid = useMarkPaid();

  const errors: Record<Press, unknown> = {
    setStatus: setStatus.error,
    addWork: addWork.error,
    remove: remove.error,
    markPaid: markPaid.error,
  };

  return {
    setStatus: {
      ...setStatus,
      mutate: (args: { status: InvoiceStatus }) => {
        setLast('setStatus');
        setStatus.mutate(args);
      },
    },
    addWork: {
      isPending: addWork.isPending,
      mutate: () => {
        setLast('addWork');
        addWork.mutate();
      },
    },
    /* It leaves the page, so it stays pending until the list arrives. */
    remove: {
      ...remove,
      isPending: remove.isPending || remove.isSuccess,
      mutate: () => {
        setLast('remove');
        remove.mutate();
      },
    },
    markPaid: {
      ...markPaid,
      show: (invoice: Invoice) => {
        setLast('markPaid');
        markPaid.show(invoice);
      },
    },
    /* The download is a navigation the page can't await, and it records the
       dates the client's copy printed, which Mark sent keeps; the server's
       answer arrives once it has rendered. */
    download: () =>
      setTimeout(
        () => qc.invalidateQueries({ queryKey: keys.invoice(id) }),
        1500,
      ),
    lastError: last ? errors[last] : null,
  };
}

export type UseInvoiceActions = ReturnType<typeof useInvoiceActions>;
