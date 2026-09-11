'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { StatusBadge, money, shortDate } from './invoice-bits';
import { api, type Invoice } from '@/lib/client/api';

export function InvoiceList() {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.invoices(),
  });
  const { data: clientData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients({ includeArchived: true }),
  });

  const invoices = data?.invoices ?? [];
  const names = new Map((clientData?.clients ?? []).map((c) => [c.id, c.name]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-strong">
          Invoices
        </h1>
        <Button asChild>
          <Link href="/invoices/new">New invoice</Link>
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-primary shadow-card">
        {isLoading ? (
          <Empty>Loading…</Empty>
        ) : invoices.length === 0 ? (
          <Empty>
            No invoices yet. Preview a period to see what it would bill.
          </Empty>
        ) : (
          <ul>
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <Row invoice={invoice} clientName={names.get(invoice.clientId)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Row({
  invoice,
  clientName,
}: {
  invoice: Invoice;
  clientName?: string;
}) {
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex items-center gap-3 border-t border-edge-subtle px-4 py-3
                 first:border-t-0 hover:bg-surface-hover"
    >
      <span className="tabular w-20 flex-none font-mono text-[12.5px] text-muted">
        {invoice.invoiceNumber}
      </span>

      <span className="min-w-0 flex-1 truncate text-[14.5px] text-primary">
        {clientName ?? 'Unknown client'}
      </span>

      <StatusBadge status={invoice.status} />

      <span className="tabular hidden w-24 flex-none text-right font-mono text-[11.5px] text-subtle sm:block">
        {shortDate(invoice.issueDate)}
      </span>

      <span className="tabular w-24 flex-none text-right font-mono text-[14px] text-primary">
        {money(invoice.total, invoice.currency)}
      </span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-10 text-center text-[13.5px] text-subtle">{children}</p>
  );
}
