'use client';

import type { QueryClient } from '@tanstack/react-query';
import { api, type Client, type Project } from './api';
import {
  useOptimisticMutation,
  keys,
  invalidateEntryData,
  predictRestore,
} from '@stint/client';

/** A project's rate is what its unbilled work is valued at, in every
    rollup. */
export const invalidateProjects = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.projects() }),
    invalidateEntryData(qc),
  ]);

/** Restores a project, predicted: it is back on the press, and a refusal
    puts it back while the notice says why. `activeClients` are the clients
    an active list shows; undefined while unknown. */
export function useRestoreProject(activeClients: Client[] | undefined) {
  return useOptimisticMutation<Project, unknown, unknown>({
    queryKey: () => keys.projects(),
    mutationFn: (project) => api.restoreProject(project.id),
    predict: (current, project, key) =>
      predictRestore(
        'projects',
        project,
        current,
        key,
        /* Unknown counts as listed: the refetch drops it if its client
           turns out archived. */
        project.clientId === null ||
          !activeClients ||
          activeClients.some((c) => c.id === project.clientId),
      ),
    invalidate: invalidateProjects,
  });
}
