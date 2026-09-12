/**
 * Local-calendar boundaries.
 *
 * "Today" is a local question, and a timezone's offset is not constant —
 * on a DST transition day, midnight had a different offset than noon.
 * Computing midnight with the *current* offset is off by an hour twice a
 * year, which silently mis-buckets entries into the wrong day.
 *
 * These resolve the offset AT the candidate instant and re-check, which
 * converges because DST shifts are at most an hour.
 */

/** Offset of `tz` at a given instant, in milliseconds. */
function tzOffset(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

function localDate(at: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** The UTC instant at which the local day containing `now` began. */
export function startOfLocalDay(now: Date, tz: string): Date {
  const { y, m, d } = localDate(now, tz);
  const wall = Date.UTC(y, m - 1, d);
  let guess = new Date(wall - tzOffset(now, tz));
  guess = new Date(wall - tzOffset(guess, tz));
  return guess;
}

/** Local day `n` days before the one containing `now`. */
export function startOfLocalDayOffset(
  now: Date,
  tz: string,
  daysBack: number,
): Date {
  const { y, m, d } = localDate(now, tz);
  const wall = Date.UTC(y, m - 1, d - daysBack);
  let guess = new Date(wall - tzOffset(now, tz));
  guess = new Date(wall - tzOffset(guess, tz));
  return guess;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local day-of-week, 0=Sunday. */
export function localDayOfWeek(at: Date, tz: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(at);
  return Math.max(0, DAYS.indexOf(name));
}

/** Start of the local week, honouring the user's `weekStartsOn` (0=Sun). */
export function startOfLocalWeek(
  now: Date,
  tz: string,
  weekStartsOn: number,
): Date {
  const back = (localDayOfWeek(now, tz) - weekStartsOn + 7) % 7;
  return startOfLocalDayOffset(now, tz, back);
}

/** `2026-09-11` in the given zone — the key a calendar view groups by. */
export function localDateKey(at: Date, tz: string): string {
  const { y, m, d } = localDate(at, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Rejects a bad IANA zone before it reaches a query. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
