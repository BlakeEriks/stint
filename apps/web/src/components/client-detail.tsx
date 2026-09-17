'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/client/api';
import { DetailPage, Listing } from './page';
import { ClientProjects } from './client-projects';
import { formatCurrency } from '@stint/core';
import { keys } from '@/lib/client/query-keys';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';

export function ClientDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.client(id),
    queryFn: () => api.client(id),
  });

  const archive = useMutation({
    mutationFn: () => api.archiveClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.clients() });
      queryClient.invalidateQueries({ queryKey: keys.stats() });
      router.push('/clients');
    },
  });

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

              <div className="flex flex-none gap-2">
                <Button asChild variant="secondary">
                  <Link href={`/clients/${id}/edit`}>
                    <Pencil aria-hidden strokeWidth={1.75} />
                    Edit
                  </Link>
                </Button>
                {!client.archivedAt ? (
                  <Button
                    variant="ghost"
                    onClick={() => archive.mutate()}
                    disabled={archive.isPending}
                  >
                    <Archive aria-hidden strokeWidth={1.75} />
                    Archive
                  </Button>
                ) : null}
              </div>
            </header>

            {/* A rejected archive leaves the button live and the client unchanged,
                which reads as the click not registering. The likely refusals are
                worth reading — an archive can be blocked by what references the
                client. */}
            {archive.error ? (
              <p role="alert" className="pb-4 type-support text-danger">
                {archive.error instanceof ApiError
                  ? archive.error.message
                  : 'Could not archive this client.'}
              </p>
            ) : null}

            <dl
              className="grid gap-x-6 gap-y-4 rounded-xl border border-edge-subtle
                           bg-surface-elevated p-5 shadow-card sm:grid-cols-2"
            >
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
              <p className="mt-4 type-support text-muted">
                Archived. Past invoices still reference this client.
              </p>
            ) : null}

            <ClientProjects client={client} />
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
      {hint && !value ? (
        <p className="mt-0.5 type-support text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
