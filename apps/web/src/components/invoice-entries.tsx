'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '@stint/client';
import {
  formatCurrency,
  formatHours,
  hundredths,
  localDateKey,
} from '@stint/core';
import { Pencil } from 'lucide-react';
import { api, type InvoiceEntry } from '@/lib/client/api';
import { useDialog } from '@/lib/client/use-dialog';
import { timeZone as tz } from '@/lib/client/use-timer';
import { EntryDialog } from './entry-dialog';
import { shortDate } from './invoice-bits';
import { rowBleed, rowButton } from './row-button';

/**
 * The entries an invoice holds, under the sheet rather than on it: the PDF
 * is what the client reads, this is the owner's check of it. A draft's rows
 * open the entry to fix it, and the save refetches the draft. An issued
 * invoice's are locked, so its rows are text.
 */
export function InvoiceEntries({
  invoiceId,
  entries,
  currency,
  draft,
}: {
  invoiceId: string;
  entries: InvoiceEntry[];
  currency: string;
  draft: boolean;
}) {
  const qc = useQueryClient();
  const editor = useDialog<InvoiceEntry>();
  const { data: projects = [] } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
    select: (r) => r.projects,
    enabled: draft,
  });

  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="invoice-entries" className="mt-8">
      <h2
        id="invoice-entries"
        className="border-b border-edge-subtle pb-2 type-region-head text-subtle"
      >
        Entries
      </h2>
      <ul className="divide-y divide-edge-subtle">
        {entries.map((entry) => (
          <li key={entry.id}>
            {draft ? (
              <button
                type="button"
                onClick={() => editor.show(entry)}
                className={`${rowButton} ${rowBleed} flex items-center gap-3`}
              >
                <span className="sr-only">Edit</span>{' '}
                <Row entry={entry} currency={currency} />
                <Pencil
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5 flex-none text-subtle group-hover:text-strong"
                />
              </button>
            ) : (
              <Row entry={entry} />
            )}
          </li>
        ))}
      </ul>

      {editor.subject ? (
        <EntryDialog
          open={editor.open}
          onOpenChange={editor.onOpenChange}
          existing={editor.subject}
          projects={projects}
          /* The entry's own refetch doesn't reach the invoice, whose lines,
             total and list it priced. */
          onSaved={() =>
            qc.invalidateQueries({ queryKey: keys.invoice(invoiceId) })
          }
        />
      ) : null}
    </section>
  );
}

/** One line from `sm`: date, task, project, hours, amount. On a phone the
    task takes the width, over its date and project: date, task and amount,
    then project and hours. Without `currency` it is an issued invoice's,
    with no amount. */
function Row({ entry, currency }: { entry: InvoiceEntry; currency?: string }) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,12rem)_4rem_auto]">
      <span className="col-start-1 row-start-1 truncate type-control text-primary sm:col-start-2">
        {entry.taskName || 'Untitled'}
      </span>
      <span className="col-start-1 row-start-2 flex min-w-0 gap-1.5 type-support text-muted sm:contents">
        <span className="whitespace-nowrap sm:col-start-1 sm:row-start-1 sm:type-meta">
          {shortDate(localDateKey(new Date(entry.startedAt), tz))}
        </span>
        <span aria-hidden className="sm:hidden">
          ·
        </span>
        <span className="truncate sm:col-start-3 sm:row-start-1">
          {entry.projectName ?? 'No project'}
        </span>
      </span>
      <span className="col-start-2 row-start-2 text-right type-duration text-muted sm:col-start-4 sm:row-start-1">
        {formatHours(hundredths(entry.durationSeconds ?? 0) / 100)}h
      </span>
      {currency === undefined ? null : (
        <span className="col-start-2 row-start-1 text-right type-duration text-primary sm:col-start-5 sm:min-w-24">
          {amount(entry, currency)}
        </span>
      )}
    </div>
  );
}

const amount = (entry: InvoiceEntry, currency: string) => {
  if (entry.amount != null) return formatCurrency(entry.amount, currency);
  return entry.isBillable ? 'No rate' : 'Not billable';
};
