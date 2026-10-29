import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@stint/client';
import { api, type InvoiceStatus } from './api';

/** One invoice in full, as its page reads it, so a prefetch fills that read. */
export const invoiceQuery = (id: string) => ({
  queryKey: keys.invoice(id),
  queryFn: () => api.invoice(id),
});

/* One contractor holds a handful of open invoices; the cap only stops a
   backlog from asking for each of them at once. */
const MOST = 20;

/**
 * Fetches each draft and open invoice in full once a list showing them has
 * painted, so opening one shows it with its actions live. A paid or void
 * invoice is finished and opened rarely, so it waits for its page.
 */
export function usePrefetchInvoices(
  invoices: readonly { id: string; status: InvoiceStatus }[] | undefined,
) {
  const qc = useQueryClient();
  const ids = (invoices ?? [])
    .filter((i) => i.status === 'draft' || i.status === 'sent')
    .slice(0, MOST)
    .map((i) => i.id)
    .join(',');
  useEffect(() => {
    if (!ids) return;
    for (const id of ids.split(',')) {
      // Fresh for 30s, so a list drawn again within it asks for nothing.
      void qc.prefetchQuery({ ...invoiceQuery(id), staleTime: 30_000 });
    }
  }, [qc, ids]);
}
