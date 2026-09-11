'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, type Client } from '@/lib/client/api';

/** Rates are money and sit in a column, so they are mono and tabular. */
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function ClientList() {
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { archived: showArchived }],
    queryFn: () => api.clients({ includeArchived: showArchived }),
  });

  const clients = data?.clients ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-strong">
          Clients
        </h1>
        <Button asChild>
          <Link href="/clients/new">Add client</Link>
        </Button>
      </header>

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-primary shadow-card">
        {isLoading ? (
          <Empty>Loading…</Empty>
        ) : clients.length === 0 ? (
          <Empty>
            {showArchived
              ? 'No clients yet.'
              : 'No clients yet. Add one to set a rate and bill against it.'}
          </Empty>
        ) : (
          <ul>
            {clients.map((client) => (
              <li key={client.id}>
                <Row client={client} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowArchived((v) => !v)}
        className="mt-3 px-1 font-mono text-[11px] uppercase tracking-[0.14em]
                   text-subtle hover:text-muted"
      >
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>
    </main>
  );
}

function Row({ client }: { client: Client }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="flex items-center gap-3 border-t border-edge-subtle px-4 py-3
                 first:border-t-0 hover:bg-surface-hover"
    >
      <span
        aria-hidden
        className="size-2 flex-none rounded-[2px]"
        style={{ background: client.color ?? 'var(--text-subtle)' }}
      />

      <span className="min-w-0 flex-1 truncate text-[14.5px] text-primary">
        {client.name}
      </span>

      {client.archivedAt ? (
        <span className="flex-none rounded border border-edge-default px-1.5 py-px
                         font-mono text-[9.5px] uppercase tracking-wider text-subtle">
          Archived
        </span>
      ) : null}

      <span className="hidden min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted sm:block">
        {client.email ?? ''}
      </span>

      <span className="tabular w-24 flex-none text-right font-mono text-[13px] text-muted">
        {client.hourlyRate != null ? `${usd.format(client.hourlyRate)}/h` : '—'}
      </span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-10 text-center text-[13.5px] text-subtle">{children}</p>
  );
}
