import { keys } from '@stint/client';
import { queryOptions } from '@tanstack/react-query';
import type { Api } from './api.ts';
import { RECENT_FETCHED } from './screen-state.ts';

/**
 * The timer screen's reads beside the timer's own (`summaryQuery`), as
 * options: the screen and the surfaces outside the app (`surfaces.ts`) read
 * the same cache entries, so neither fetches a shape the other doesn't expect.
 */
export function screenReads(
  api: Pick<Api, 'stats' | 'projects' | 'clients' | 'taskNames'>,
  timeZone: string,
) {
  return {
    stats: queryOptions({
      queryKey: keys.stats(timeZone),
      queryFn: () => api.stats(timeZone),
    }),
    /** Archived included: a running entry on one still shows its name. */
    projects: queryOptions({
      queryKey: keys.projects({ archived: true }),
      queryFn: () => api.projects().then((r) => r.projects),
    }),
    clients: queryOptions({
      queryKey: keys.clients({ archived: true }),
      queryFn: () => api.clients().then((r) => r.clients),
    }),
    /** Newest first: Recent shows them, and Start begins the first. */
    taskNames: queryOptions({
      queryKey: keys.taskNames({}),
      queryFn: () => api.taskNames(RECENT_FETCHED).then((r) => r.taskNames),
    }),
  };
}
