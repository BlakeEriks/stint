'use client';

import type { QueryClient } from '@tanstack/react-query';
import { api, type Client } from './api';
import {
  useOptimisticMutation,
  keys,
  invalidateEntryData,
  predictArchive,
  predictRestore,
} from '@stint/client';

/* Archiving or restoring moves the client's rate in or out of every rollup,
   and its projects in or out of every picker. */
const invalidate = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.clients() }),
    qc.invalidateQueries({ queryKey: keys.projects() }),
    invalidateEntryData(qc),
  ]);

/** Archives a client by id: predicted, so the client goes on the press, and a
    refusal puts it back while the notice says why. */
export function useArchiveClient() {
  return useOptimisticMutation<string, unknown, unknown>({
    queryKey: () => keys.clients(),
    mutationFn: (id) => api.archiveClient(id),
    predict: (current, id, key) => predictArchive('clients', id, current, key),
    invalidate,
  });
}

/** Restores a client, predicted the same way: it is back under Active on
    the press. */
export function useRestoreClient() {
  return useOptimisticMutation<Client, unknown, unknown>({
    queryKey: () => keys.clients(),
    mutationFn: (client) => api.restoreClient(client.id),
    predict: (current, client, key) =>
      predictRestore('clients', client, current, key),
    invalidate,
  });
}
