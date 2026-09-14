'use client';

import { useQuery } from '@tanstack/react-query';
import { ClientForm } from './client-form';
import { api } from '@/lib/client/api';
import { DetailPage, Listing } from './page';
import { keys } from '@/lib/client/query-keys';

/**
 * The form needs the existing values before it can render, so the fetch lives
 * here rather than inside the form — which stays a controlled component.
 */
export function EditClient({ id }: { id: string }) {
  const query = useQuery({
    queryKey: keys.client(id),
    queryFn: () => api.client(id),
  });

  return (
    <DetailPage back={`/clients/${id}`} label="Back">
      <h1 className="mb-6 type-title text-strong">Edit client</h1>
      <Listing query={query} missing="That client no longer exists.">
        {(client) => <ClientForm existing={client} />}
      </Listing>
    </DetailPage>
  );
}
