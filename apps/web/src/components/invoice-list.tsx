'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { StatusBadge, money, shortDate } from './invoice-bits';
import { api, type Invoice, type InvoiceStatus } from '@/lib/client/api';
import { Page } from './page';
import { Check, Plus } from 'lucide-react';

/**
 * Open means "money still owed": issued and not yet collected. A draft is
 * included because it is work you have decided to bill and not yet sent, so
 * it is still outstanding from your side.
 */
const OPEN: InvoiceStatus[] = ['draft', 'sent'];

/**
 * This is the screen to open when money lands.
 *
 * Reconciling several payments at once is a batch task — you work down a
 * list — which is why the home screen carries one outstanding number rather
 * than an open-invoices panel.
 */
export function InvoiceList() {
  const params = useSearchParams();
  const queryClient = useQueryClient();

  /* Open by default: a paid invoice is finished, and a list that leads with
     finished work makes you scroll past history to reach what needs doing.
     The home screen's awaiting-payment line links here with ?status=sent. */
  const status = params.get('status');
  const showAll = status === 'all';

  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices(),
  });
  const { data: clientData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients({ includeArchived: true }),
  });

  const all = data?.invoices ?? [];
  const names = new Map((clientData?.clients ?? []).map((c) => [c.id, c.name]));

  const invoices = showAll
    ? all
    : all.filter((i) =>
        status ? i.status === status : OPEN.includes(i.status),
      );

  // Only what is actually owed — a filtered view that totalled everything
  // would contradict the rows beneath it.
  const outstanding = all
    .filter((i) => i.status === 'sent')
    .reduce((a, i) => a + i.total, 0);

  const markPaid = useMutation({
    mutationFn: (id: string) => api.updateInvoiceStatus(id, { status: 'paid' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return (
    <Page>
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="type-title text-strong">Invoices</h1>
        <Button asChild>
          <Link href="/invoices/new">
            <Plus aria-hidden strokeWidth={2.25} />
            New invoice
          </Link>
        </Button>
      </header>

      <div className="flex items-baseline justify-between gap-3 pb-2">
        <nav aria-label="Filter" className="flex gap-1">
          {[
            { key: null, label: 'Open' },
            { key: 'paid', label: 'Paid' },
            { key: 'all', label: 'All' },
          ].map(({ key, label }) => {
            const active = key === null ? !status : status === key;
            return (
              <Link
                key={label}
                href={key ? `/invoices?status=${key}` : '/invoices'}
                aria-current={active ? 'page' : undefined}
                className={`rounded-md px-2 py-1 type-label ${
                  active
                    ? 'bg-surface-elevated text-strong'
                    : 'text-subtle hover:text-muted'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {outstanding > 0 ? (
          <span className="type-support text-subtle">
            <span className="type-meta text-muted">
              {money(outstanding, all[0]?.currency)}
            </span>{' '}
            outstanding
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
        {isLoading ? (
          <Empty>Loading…</Empty>
        ) : invoices.length === 0 ? (
          <Empty>
            {all.length === 0
              ? 'No invoices yet. Preview a period to see what it would bill.'
              : 'Nothing open. Everything issued has been paid.'}
          </Empty>
        ) : (
          <ul>
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <Row
                  invoice={invoice}
                  clientName={names.get(invoice.clientId)}
                  onMarkPaid={
                    invoice.status === 'sent'
                      ? () => markPaid.mutate(invoice.id)
                      : undefined
                  }
                  busy={markPaid.isPending}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}

function Row({
  invoice,
  clientName,
  onMarkPaid,
  busy,
}: {
  invoice: Invoice;
  clientName?: string;
  /** Only for `sent`: a draft is not owed yet and a paid one is finished. */
  onMarkPaid?: () => void;
  busy: boolean;
}) {
  /* A grid, not a link wrapping a button: an <a> containing a <button> is
     invalid HTML and breaks keyboard navigation. */
  return (
    <div className="flex items-center gap-3 border-t border-edge-subtle px-4 py-3 first:border-t-0">
      <Link
        href={`/invoices/${invoice.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
      >
        <span className="w-20 flex-none type-meta text-muted">
          {invoice.invoiceNumber}
        </span>
        <span className="min-w-0 flex-1 truncate type-control text-primary">
          {clientName ?? 'Unknown client'}
        </span>
      </Link>

      <StatusBadge status={invoice.status} />

      <span className="hidden w-24 flex-none text-right type-meta text-subtle sm:block">
        {shortDate(invoice.issueDate)}
      </span>

      <span className="w-24 flex-none text-right type-duration text-primary">
        {money(invoice.total, invoice.currency)}
      </span>

      {/* Nothing destructive here either — voiding stays on the invoice. */}
      {onMarkPaid ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={`Mark ${invoice.invoiceNumber} paid`}
          disabled={busy}
          onClick={onMarkPaid}
        >
          <Check aria-hidden />
          <span className="hidden sm:inline">Paid</span>
        </Button>
      ) : (
        <span className="w-6 flex-none" aria-hidden />
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-10 text-center type-support text-subtle">
      {children}
    </p>
  );
}
