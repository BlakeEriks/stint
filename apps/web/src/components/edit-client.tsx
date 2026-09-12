'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClientForm } from './client-form';
import { api } from '@/lib/client/api';
import { Page } from './page';

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
    <Page>
      <Link
        href={`/clients/${id}`}
        className="type-label text-subtle hover:text-muted"
      >
        ← Back
      </Link>
      <h1 className="mt-4 mb-6 type-title text-strong">Edit client</h1>

      {isLoading ? (
        <p className="type-support text-subtle">Loading…</p>
      ) : client ? (
        <ClientForm existing={client} />
      ) : (
        <p className="type-support text-subtle">Not found.</p>
      )}
    </Page>
  );
}
