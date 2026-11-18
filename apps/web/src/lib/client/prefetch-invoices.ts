import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { keys } from '@stint/client';
import { api, type InvoiceStatus } from './api';

/* An invoice's page is one static route with the id in its query, never a
   path segment: the router reuses a static route's prefetch for any query,
   so a press switches at once, where a dynamic route waits on the server
   whenever its own URL's prefetch hasn't landed (Constitution VI). */
const PAGE = '/invoices/view';

/** One invoice's page. Its link takes `prefetch={false}`: the router
 *  prefers a row's own prefetch, still in flight, to the page's landed one,
 *  and a press then waits for it. */
export const invoiceHref = (id: string) => `${PAGE}?id=${id}`;

/** One invoice in full, as its page reads it, so a prefetch fills that read. */
const invoiceQuery = (id: string) => ({
  queryKey: keys.invoice(id),
  queryFn: () => api.invoice(id),
});

/* One contractor holds a handful of open invoices; the cap only stops a
   backlog from asking for each of them at once. */
const MOST = 20;

/**
 * Fetches each draft and open invoice in full once a list showing them has
 * painted, so opening one shows it with its actions live. A paid or void
 * invoice is finished and opened rarely, so it waits for its page. The
 * page itself is prefetched once, and a press on any of them reuses it.
 */
export function usePrefetchInvoices(
  invoices: readonly { id: string; status: InvoiceStatus }[] | undefined,
) {
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    router.prefetch(PAGE);
  }, [router]);
  const ids = (invoices ?? [])
    .filter((i) => i.status === 'draft' || i.status === 'sent')
    .slice(0, MOST)
    .map((i) => i.id)
    .join(',');
  useEffect(() => {
    if (!ids) return;
    /* Only what isn't cached, as `ensureQueryData` does: a write
       invalidates them all, and the page's own read refetches a stale one
       when it opens. `prefetchQuery`, because a failure here is the page's
       to report, not an unhandled rejection. */
    for (const id of ids.split(',')) {
      if (qc.getQueryData(keys.invoice(id)) === undefined)
        void qc.prefetchQuery(invoiceQuery(id));
    }
  }, [qc, ids]);
}

/**
 * After a row writes to an invoice, its copy fetched beforehand goes, so
 * opening it draws from the refreshed row rather than the old status with
 * live actions. An open page keeps its copy and refetches it as before.
 */
export function forgetInvoice(qc: QueryClient, id: string) {
  const query = qc
    .getQueryCache()
    .find({ queryKey: keys.invoice(id), exact: true });
  if (query && query.getObserversCount() === 0)
    qc.getQueryCache().remove(query);
}
