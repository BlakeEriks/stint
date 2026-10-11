'use client';

import { useQuery } from '@tanstack/react-query';
import { useDialog } from '@/lib/client/use-dialog';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Client } from '@/lib/client/api';
import { DetailPage, Listing } from './page';
import { ClientDialog } from './client-dialog';
import { ClientProjects } from './client-projects';
import { formatCurrency } from '@stint/core';
import { keys } from '@/lib/client/query-keys';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';

export function ClientDetail({ id }: { id: string }) {
  const query = useQuery({
    queryKey: keys.client(id),
    queryFn: () => api.client(id),
  });

  const editing = useDialog<Client>();

  return (
    <DetailPage back="/clients" label="Clients">
      <Listing query={query} missing="That client no longer exists.">
        {(client) => (
          <>
            <header className="flex items-start justify-between gap-3 pb-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-3 flex-none rounded-[3px]"
                  style={{ background: client.color ?? INTERNAL_SWATCH }}
                />
                <h1 className="truncate type-title text-strong">
                  {client.name}
                </h1>
              </div>

              <Button
                variant="default"
                onClick={() => editing.show(client)}
                className="flex-none"
              >
                <Pencil aria-hidden strokeWidth={1.75} />
                Edit
              </Button>
            </header>

            <dl className="grid gap-x-6 gap-y-4 border-t border-edge-subtle py-[18px] sm:grid-cols-2">
              <Detail label="Email" value={client.email} />
              <Detail
                label="Hourly rate"
                value={
                  client.hourlyRate != null
                    ? `${formatCurrency(client.hourlyRate, client.currency ?? undefined)}/h`
                    : null
                }
                hint="Defaults to your standard rate."
                mono
              />
              <Detail
                label="Tax rate"
                /* `!= null`, not truthiness: 0% is a real answer a US contractor
                   sets deliberately, and rendering it as "Not set" is wrong about
                   tax. The rate field above already does this correctly. */
                value={client.taxRate != null ? `${client.taxRate}%` : null}
                hint="US services usually owe none."
                mono
              />
              <Detail label="Address" value={client.address} multiline />
            </dl>

            {client.archivedAt ? (
              <p className="pb-[18px] type-support text-muted">
                Archived. Past invoices still reference this client.
              </p>
            ) : null}

            <ClientProjects client={client} />

            {editing.subject ? (
              <ClientDialog
                open={editing.open}
                onOpenChange={editing.onOpenChange}
                client={editing.subject}
              />
            ) : null}
          </>
        )}
      </Listing>
    </DetailPage>
  );
}

function Detail({
  label,
  value,
  hint,
  mono,
  multiline,
}: {
  label: string;
  value?: string | null;
  hint?: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      <dt className="type-label text-subtle">{label}</dt>
      <dd
        className={`mt-1 type-control ${value ? 'text-primary' : 'text-subtle'} ${
          mono ? 'type-duration' : ''
        } ${multiline ? 'whitespace-pre-line' : ''}`}
      >
        {value || 'Not set'}
      </dd>
      {/* A `dd` of its own: a list group may hold only `dt` and `dd`. */}
      {hint && !value ? (
        <dd className="mt-0.5 type-support text-subtle">{hint}</dd>
      ) : null}
    </div>
  );
}
