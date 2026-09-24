'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { api, type ClientWithScale } from '@/lib/client/api';
import { FilterTabs, Listing, Page, Panel } from './page';
import { Pip } from './home-shell';
import { Plus } from 'lucide-react';
import { formatCurrency } from '@stint/core';
import { keys } from '@/lib/client/query-keys';

/** Rates are money and sit in a column, so they are mono and tabular. */
export function ClientList() {
  /* The filter lives in the URL, like /invoices: the view is linkable and
     Back returns to it, where a local toggle was neither. */
  const params = useSearchParams();
  const status = params.get('status');
  const wantArchived = status === 'archived' || status === 'all';

  const query = useQuery({
    queryKey: keys.clients({ archived: wantArchived, scale: true }),
    queryFn: () =>
      api.clients({ includeArchived: wantArchived, withScale: true }),
    /* The API includes archived rather than returning only them, so
       "Archived" narrows what came back. */
    select: (r) =>
      status === 'archived' ? r.clients.filter((c) => c.archivedAt) : r.clients,
  });

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

      <div className="pb-2">
        <FilterTabs
          base="/clients"
          active={status}
          tabs={[
            { key: null, label: 'Active' },
            { key: 'archived', label: 'Archived' },
            { key: 'all', label: 'All' },
          ]}
        />
      </div>

      <Listing
        query={query}
        empty={
          status === 'archived'
            ? 'No archived clients.'
            : status === 'all'
              ? 'No clients yet.'
              : 'No clients yet. Add one to set a rate and bill against it.'
        }
      >
        {(clients) => (
          <Panel>
            <ul className="divide-y divide-edge-subtle">
              {clients.map((client) => (
                <li key={client.id}>
                  <Row client={client} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </Listing>
    </Page>
  );
}

function Row({ client }: { client: ClientWithScale }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-surface-hover"
    >
      <Pip color={client.color} />
      {/* Name above, secondary detail below. The email joins the detail line
          rather than taking a column that truncates to nothing. */}
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
        {client.hourlyRate != null
          ? `${formatCurrency(client.hourlyRate, client.currency ?? undefined)}/h`
          : '—'}
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
    parts.push(
      `${formatCurrency(unbilledAmount, client.currency ?? undefined)} unbilled`,
    );
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
