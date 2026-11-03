import { startOfLocalDate, startOfLocalDay } from '@stint/core';

const KEY = 'stint.today';

/**
 * How far `?today=YYYY-MM-DD` moves the app's today, so a preview or local
 * build can be tested as of another day. Measured between local midnights in
 * `tz`, so the wall clock reads the same across a DST change. The choice
 * sticks for the tab's session; an empty `?today=` clears it.
 */
export function chooseToday(
  search: string,
  storage: Storage,
  vercelEnv: string | undefined,
  tz: string,
  real = new Date(),
): number {
  if (vercelEnv !== undefined && vercelEnv !== 'preview') return 0;
  const asked = new URLSearchParams(search).get('today');
  if (asked === '') storage.removeItem(KEY);
  else if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked))
    storage.setItem(KEY, asked);

  const chosen = storage.getItem(KEY);
  if (!chosen) return 0;
  return (
    startOfLocalDate(chosen, tz).getTime() - startOfLocalDay(real, tz).getTime()
  );
}
