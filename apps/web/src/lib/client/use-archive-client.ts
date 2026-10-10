'use client';

import { api } from './api';
import { useOptimisticMutation } from './mutations';
import { keys, invalidateEntryData, predictArchive } from './query-keys';

/** Archives a client by id: predicted, so the client goes on the press, and a
    refusal puts it back while the notice says why. */
export function useArchiveClient() {
  return useOptimisticMutation<string, unknown, unknown>({
    queryKey: () => keys.clients(),
    mutationFn: (id) => api.archiveClient(id),
    predict: (current, id, key) => predictArchive('clients', id, current, key),
    /* Archiving withdraws the client's rate from every rollup, and its
       projects from every picker. */
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.clients() }),
        qc.invalidateQueries({ queryKey: keys.projects() }),
        invalidateEntryData(qc),
      ]),
  });
}
