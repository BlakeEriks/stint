'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client/api';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function ClientDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.client(id),
  });

  const archive = useMutation({
    mutationFn: () => api.archiveClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.push('/clients');
    },
  });

  if (isLoading) {
    return <Shell><p className="text-[13.5px] text-subtle">Loading…</p></Shell>;
  }
  if (!client) {
    return <Shell><p className="text-[13.5px] text-subtle">Not found.</p></Shell>;
  }

  return (
    <Shell>
      <header className="flex items-start justify-between gap-3 pb-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="size-3 flex-none rounded-[3px]"
            style={{ background: client.color ?? 'var(--text-subtle)' }}
          />
          <h1 className="truncate text-2xl font-semibold tracking-tight text-strong">
            {client.name}
          </h1>
        </div>

        <div className="flex flex-none gap-2">
          <Button asChild variant="secondary">
            <Link href={`/clients/${id}/edit`}>Edit</Link>
          </Button>
          {!client.archivedAt ? (
            <Button
              variant="ghost"
              onClick={() => archive.mutate()}
              disabled={archive.isPending}
            >
              Archive
            </Button>
          ) : null}
        </div>
      </header>

      <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-edge-subtle
                     bg-surface-base p-5 sm:grid-cols-2">
        <Detail label="Email" value={client.email} />
        <Detail
          label="Hourly rate"
          value={
            client.hourlyRate != null ? `${usd.format(client.hourlyRate)}/h` : null
          }
          hint="Falls back to your default rate."
          mono
        />
        <Detail
          label="Tax rate"
          value={client.taxRate ? `${client.taxRate}%` : null}
          hint="US services usually owe none."
          mono
        />
        <Detail label="Address" value={client.address} multiline />
      </dl>

      {client.archivedAt ? (
        <p className="mt-4 text-[13px] text-muted">
          Archived. Past invoices still reference this client.
        </p>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/clients"
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle
                   hover:text-muted"
      >
        ← Clients
      </Link>
      <div className="mt-4">{children}</div>
    </main>
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
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
        {label}
      </dt>
      <dd
        className={`mt-1 text-[14px] ${value ? 'text-primary' : 'text-subtle'} ${
          mono ? 'tabular font-mono' : ''
        } ${multiline ? 'whitespace-pre-line' : ''}`}
      >
        {value || 'Not set'}
      </dd>
      {hint && !value ? (
        <p className="mt-0.5 text-[12px] text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
