import type { QueryClient, QueryKey } from '@tanstack/react-query';

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
  entries: (opts?: { from: string; to?: string }) =>
    opts ? (['entries', opts] as const) : (['entries'] as const),
  entry: (id: string) => ['entries', id] as const,
  stats: (tz?: string) =>
    tz ? (['stats', tz] as const) : (['stats'] as const),
  activity: (tz?: string, days?: number) =>
    tz ? (['activity', tz, days] as const) : (['activity'] as const),
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
  account: () => ['account'] as const,
  invoices: () => ['invoices'] as const,
  invoice: (id: string | null | undefined) => ['invoices', id] as const,
  settings: () => ['settings'] as const,
  paymentProfiles: () => ['payment-profiles'] as const,
};

/**
 * Whether a cached list under `keys.clients()` or `keys.projects()` holds
 * archived rows too. An archive's prediction drops the row from every other
 * list and leaves these alone.
 */
export function listsArchived(key: QueryKey): boolean {
  const opts = key[1];
  return typeof opts === 'object' && opts !== null && 'archived' in opts
    ? opts.archived === true
    : false;
}

/**
 * An archive's prediction for one cached list under `keys.clients()` or
 * `keys.projects()` (`rows` names which): the row leaves a list of active
 * rows, and is marked archived in a list that holds archived rows too —
 * so a screen reading that list, such as Clients, hides it at once as well.
 */
export function predictArchive(
  rows: 'clients' | 'projects',
  id: string,
  current: unknown,
  key: QueryKey,
): unknown {
  if (typeof current !== 'object' || current === null || !(rows in current))
    return current;
  const list = (current as Record<typeof rows, Array<{ id: string }>>)[rows];
  return {
    ...current,
    [rows]: listsArchived(key)
      ? list.map((r) =>
          r.id === id ? { ...r, archivedAt: new Date().toISOString() } : r,
        )
      : list.filter((r) => r.id !== id),
  };
}

/**
 * Everything derived from time entries.
 *
 * A timer stop, an edited entry, a generated invoice and an inbox action all
 * change the same underlying rows, and each of the four views reads them
 * differently — so any one of them refreshed alone disagrees with the rest.
 */
export function invalidateEntryData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.summary() }),
    queryClient.invalidateQueries({ queryKey: keys.entries() }),
    queryClient.invalidateQueries({ queryKey: keys.stats() }),
    queryClient.invalidateQueries({ queryKey: keys.calendar() }),
    queryClient.invalidateQueries({ queryKey: keys.activity() }),
    /* Starting a timer or saving an entry mints a task name, so a list held
       from before it is one suggestion short of what the user just typed. */
    queryClient.invalidateQueries({ queryKey: keys.taskNames() }),
  ]);
}
