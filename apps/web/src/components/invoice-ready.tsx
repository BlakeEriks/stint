'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { keys } from '@stint/client';
import { formatCompact, formatCurrency } from '@stint/core';
import { api, type Client } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { newInvoiceHref, periodName } from './invoice-bits';
import { SHEET } from './invoice-preview-card';
import { rowBleed, rowButton } from './row-button';
import { Swatch } from './swatch';

/**
 * New invoice before a client is chosen: the page it will fill, listing
 * each client the Inbox says is ready to invoice. A row opens with that
 * client and period filled in; its amount is the preview New invoice would
 * open with. Rows wait until every one can say its amount.
 */
export function ReadyToInvoice({ clients }: { clients: Client[] }) {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });
  const due = data?.attention.unbilledDue ?? [];
  const amounts = useQueries({
    queries: due.map((d) => {
      const body = {
        clientId: d.clientId,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        tz,
      };
      return {
        queryKey: keys.invoicePreview(body),
        queryFn: () => api.previewInvoice(body),
      };
    }),
  });
  const known = data !== undefined && amounts.every((a) => !a.isPending);

  return (
    // Letter-shaped, so it is the page a client fills, not a box around a
    // list.
    <div className={`${SHEET} aspect-[8.5/11]`}>
      {known && due.length === 0 ? (
        <p className="type-body text-muted">
          Choose a client to start an invoice.
        </p>
      ) : null}
      {known && due.length > 0 ? (
        <section aria-labelledby="inv-ready" className="flex flex-col gap-2">
          <h2 id="inv-ready" className="type-heading text-strong">
            Ready to invoice
          </h2>
          <ul className="flex flex-col divide-y divide-edge-subtle">
            {due.map((d, i) => {
              const preview = amounts[i]?.data;
              return (
                <li key={d.clientId} className="py-1">
                  <Link
                    href={newInvoiceHref(d)}
                    className={`${rowButton} ${rowBleed} flex items-center gap-3 py-2.5`}
                  >
                    <Swatch
                      color={clients.find((c) => c.id === d.clientId)?.color}
                    />
                    <span className="truncate type-control text-strong">
                      {d.clientName}
                    </span>
                    <span className="min-w-0 flex-1 truncate type-support text-subtle">
                      {periodName(d.periodStart, d.periodEnd)} ·{' '}
                      {formatCompact(d.seconds)}
                    </span>
                    <span className="flex-none type-duration text-strong">
                      {preview
                        ? formatCurrency(preview.total, preview.currency)
                        : ''}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="size-4 flex-none text-muted"
                      strokeWidth={2}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
