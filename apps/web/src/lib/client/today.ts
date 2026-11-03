import { localDateTimeToInstant, localTimeKey } from '@stint/core';

const KEY = 'stint.today';

/**
 * How far `?today=YYYY-MM-DD` moves the app's today, so a preview or local
 * build can be tested as of another day: the chosen day at the real wall
 * clock time in `tz`, so a DST change between the two moves neither. The choice
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
  const minute = real.getTime() - (real.getTime() % 60_000);
  return (
    localDateTimeToInstant(chosen, localTimeKey(real, tz), tz).getTime() -
    minute
  );
}
