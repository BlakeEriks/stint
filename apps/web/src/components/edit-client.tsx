'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClientForm } from './client-form';
import { api } from '@/lib/client/api';

/**
 * The form needs the existing values before it can render, so the fetch lives
 * here rather than inside the form — which stays a controlled component.
 */
export function EditClient({ id }: { id: string }) {
  const { data: client, isLoading } = useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.client(id),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={`/clients/${id}`}
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle hover:text-muted"
      >
        ← Back
      </Link>
      <h1 className="mt-4 mb-6 text-2xl font-semibold tracking-tight text-strong">
        Edit client
      </h1>

      {isLoading ? (
        <p className="text-[13.5px] text-subtle">Loading…</p>
      ) : client ? (
        <ClientForm existing={client} />
      ) : (
        <p className="text-[13.5px] text-subtle">Not found.</p>
      )}
    </main>
  );
}
