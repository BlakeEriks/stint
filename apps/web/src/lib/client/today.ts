const KEY = 'stint.today';

/**
 * How far `?today=YYYY-MM-DD` moves the app's today, in whole days of ms, so
 * a preview or local build can be tested as of another day (#642). The choice
 * sticks for the tab's session; an empty `?today=` clears it. Production
 * never honors it.
 *
 * Whole days of 24h, so a choice across a DST change is an hour off near
 * midnight: a test aid, not a calendar.
 */
export function chooseToday(
  search: string,
  storage: Storage,
  vercelEnv: string | undefined,
  real = new Date(),
): number {
  if (vercelEnv === 'production') return 0;
  const asked = new URLSearchParams(search).get('today');
  if (asked === '') storage.removeItem(KEY);
  else if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked))
    storage.setItem(KEY, asked);

  const [y, m, d] = (storage.getItem(KEY) ?? '').split('-').map(Number);
  if (!y || !m || !d) return 0;
  const today = Date.UTC(real.getFullYear(), real.getMonth(), real.getDate());
  return Date.UTC(y, m - 1, d) - today;
}
