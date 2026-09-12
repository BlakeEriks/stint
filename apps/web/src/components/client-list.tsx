'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, type ClientWithScale } from '@/lib/client/api';
import { Page } from './page';
import { Plus } from 'lucide-react';

/** Rates are money and sit in a column, so they are mono and tabular. */
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function ClientList() {
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { archived: showArchived, scale: true }],
    queryFn: () =>
      api.clients({ includeArchived: showArchived, withScale: true }),
  });

  const clients = data?.clients ?? [];

  return (
    <Page>
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="type-title text-strong">Clients</h1>
        <Button asChild>
          <Link href="/clients/new">
            <Plus aria-hidden strokeWidth={2.25} />
            Add client
          </Link>
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
        className="mt-3 px-1 type-label
                   text-subtle hover:text-muted"
      >
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>
    </Page>
  );
}

function Row({ client }: { client: ClientWithScale }) {
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

      {/* Name above, secondary detail below. The email used to have its own
          column; with a second line on the left it competed for width and
          truncated to nothing, so it joins the detail line instead of
          silently disappearing. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate type-control text-primary">
          {client.name}
        </span>
        <Detail client={client} />
      </span>

      {client.archivedAt ? (
        <span
          className="flex-none rounded border border-edge-default px-1.5 py-px
                         type-badge text-subtle"
        >
          Archived
        </span>
      ) : null}

      <span className="w-24 flex-none text-right type-duration text-muted">
        {client.hourlyRate != null ? `${usd.format(client.hourlyRate)}/h` : '—'}
      </span>
    </Link>
  );
}

/**
 * How much work sits under this client.
 *
 * A list of names says nothing about what is being worked on, and clicking
 * through four clients to find a project is worse than the flat list the
 * `/projects` page now provides. A count and an amount answer "where is my
 * work?" in one line, with no interaction.
 *
 * Not a disclosure dropdown: expanding rows change the list's height as you
 * poke them, need per-row fetches or one over-fetch, and create a second
 * place project rows render. The wanted information here is SCALE, not the
 * list itself.
 */
function Detail({ client }: { client: ClientWithScale }) {
  const { projectCount, unbilledAmount } = client;

  const parts: string[] = [];
  if (projectCount > 0) {
    parts.push(
      `${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`,
    );
  }
  /* `0` unbilled is omitted rather than shown: it means everything is
     invoiced, which is the quiet good state and does not need a figure. */
  if (unbilledAmount > 0) {
    parts.push(`${usd.format(unbilledAmount)} unbilled`);
  }
  if (client.email) parts.push(client.email);

  // Nothing to say about an empty client, and a row of zeroes is noise.
  if (parts.length === 0) return null;

  return (
    <span className="mt-0.5 block truncate type-support text-subtle">
      {parts.join(' · ')}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-10 text-center type-support text-subtle">
      {children}
    </p>
  );
}
