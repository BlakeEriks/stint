import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cache key in one place.
 *
 * React Query matches a key by prefix, so `['clients']` invalidates every
 * variant under it — but only if the variants agree on their shape. Two
 * spellings of the same query (`['clients','withArchived']` and
 * `['clients',{archived:true}]`) are separate cache entries that one
 * invalidation can still miss, so the options object is the single shape.
 */
export const keys = {
  summary: () => ['summary'] as const,
  entries: (opts?: { from: string }) =>
    opts ? (['entries', opts] as const) : (['entries'] as const),
  entry: (id: string) => ['entries', id] as const,
  stats: (tz?: string) =>
    tz ? (['stats', tz] as const) : (['stats'] as const),
  activity: (tz?: string, days?: number) =>
    tz ? (['activity', tz, days] as const) : (['activity'] as const),
  /* Its own key, not a variant of `activity`: the heatmap's range is fixed,
     so sharing a key with a range the user picks would refetch every day of
     it each time that picker moved. Fixed is not immutable, though, so
     `days` is in the key: a payload cached at one length would otherwise be
     served to a view that draws a different number of cells. */
  heatmap: (tz?: string, days?: number) =>
    tz ? (['heatmap', tz, days] as const) : (['heatmap'] as const),
  calendar: (weekStart?: string, tz?: string) =>
    weekStart
      ? (['calendar', weekStart, tz] as const)
      : (['calendar'] as const),
  clients: (opts?: { archived?: boolean; scale?: boolean }) =>
    opts ? (['clients', opts] as const) : (['clients'] as const),
  client: (id: string) => ['clients', id] as const,
  projects: (opts?: { archived?: boolean; clientId?: string }) =>
    opts ? (['projects', opts] as const) : (['projects'] as const),
  taskNames: (opts?: { projectId?: string | null }) =>
    opts ? (['task-names', opts] as const) : (['task-names'] as const),
  invoices: () => ['invoices'] as const,
  invoice: (id: string | null | undefined) => ['invoices', id] as const,
  settings: () => ['settings'] as const,
  paymentProfiles: () => ['payment-profiles'] as const,
};

/**
 * Everything derived from time entries.
 *
 * A timer stop, an edited entry, a generated invoice and an inbox action all
 * change the same underlying rows, and each of the four views reads them
 * differently — so any one of them refreshed alone disagrees with the rest.
 */
export function invalidateEntryData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: keys.summary() });
  queryClient.invalidateQueries({ queryKey: keys.entries() });
  queryClient.invalidateQueries({ queryKey: keys.stats() });
  queryClient.invalidateQueries({ queryKey: keys.calendar() });
  queryClient.invalidateQueries({ queryKey: keys.activity() });
  queryClient.invalidateQueries({ queryKey: keys.heatmap() });
  /* Starting a timer or saving an entry mints a task name, so a list held
     from before it is one suggestion short of what the user just typed. */
  queryClient.invalidateQueries({ queryKey: keys.taskNames() });
}
