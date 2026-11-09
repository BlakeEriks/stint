'use client';

import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { keys } from '@stint/client';
import { formatCompact, formatCurrency } from '@stint/core';
import { api, type Client } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { newInvoiceHref, periodName } from './invoice-bits';
import { rowBleed, rowButton } from './row-button';
import { Swatch } from './swatch';

/**
 * New invoice before a client is chosen: each client the Inbox says is
 * ready to invoice, opening with that client and period filled in. Its
 * amount is the preview New invoice would open with. Absent with none, or
 * until every row can say its amount: it is a shortcut, not something the
 * user waits on.
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
  if (due.length === 0 || amounts.some((a) => a.isPending)) return null;

  return (
    <section aria-labelledby="inv-ready" className="flex flex-col gap-1.5">
      <h2 id="inv-ready" className="type-label text-subtle">
        Ready to invoice
      </h2>
      <ul className="flex flex-col">
        {due.map((d, i) => {
          const preview = amounts[i]?.data;
          return (
            <li key={d.clientId}>
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
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
