import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { QueryClient } from '@tanstack/react-query';

/**
 * The last answers this browser saw, kept so a reload paints them at once
 * and the server's answer replaces them (#383, Constitution III).
 */
export const CACHE_KEY = 'stint-query-cache';

/** A week: past that, a reload is better served by the loader. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function cachePersister() {
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: CACHE_KEY,
  });
}

/**
 * Forgets everything kept of the signed-in account, in memory and in the
 * browser. Every way out calls it (sign out, delete, an expired session, the
 * sign-in page) so the next account never paints the last one's numbers
 * (FR-009).
 */
export function forgetCache(client?: QueryClient) {
  client?.clear();
  if (typeof window !== 'undefined') window.localStorage.removeItem(CACHE_KEY);
}
