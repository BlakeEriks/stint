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

/** Start of the local calendar month containing `now`. */
export function startOfLocalMonth(now: Date, tz: string): Date {
  const { y, m } = localDate(now, tz);
  const wall = Date.UTC(y, m - 1, 1);
  let guess = new Date(wall - tzOffset(now, tz));
  guess = new Date(wall - tzOffset(guess, tz));
  return guess;
}

/** Start of the month AFTER the one containing `now` — the exclusive end. */
export function startOfNextLocalMonth(now: Date, tz: string): Date {
  const { y, m } = localDate(now, tz);
  const wall = Date.UTC(y, m, 1); // month is 1-based here, so m == next month
  let guess = new Date(wall - tzOffset(now, tz));
  guess = new Date(wall - tzOffset(guess, tz));
  return guess;
}

/**
 * Start of the local month `back` months before the one containing `now`.
 *
 * `Date.UTC` normalises a negative month index into the previous year, so a
 * window reaching past January needs no wrapping of its own.
 */
export function startOfLocalMonthsBack(
  now: Date,
  tz: string,
  back: number,
): Date {
  const { y, m } = localDate(now, tz);
  const wall = Date.UTC(y, m - 1 - back, 1);
  let guess = new Date(wall - tzOffset(now, tz));
  guess = new Date(wall - tzOffset(guess, tz));
  return guess;
}

/**
 * `YYYY-MM` keys for `count` months, ending with the one containing `now`.
 *
 * The window is built rather than read off the rows: a month nobody paid in
 * has no row to read, and it must render as a real zero in the series rather
 * than a hole in the line.
 */
export function localMonthKeys(now: Date, tz: string, count: number): string[] {
  const { y, m } = localDate(now, tz);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  }
  return keys;
}

/**
 * Business days elapsed in the local month, and the month's total.
 *
 * Pace is measured against business days, not calendar days: a 120-hour
 * target is six hours a working day, and reading "behind" on a Monday because
 * the weekend passed is noise dressed as signal.
 *
 * `elapsed` counts today as worked — you are in it — so on the 1st of a month
 * that starts midweek the ratio is 1/n rather than 0/n, which would make any
 * target look infinitely behind.
 *
 * Holidays are not modelled. A US federal calendar would be wrong for a
 * contractor who works them, and asking would be a settings screen nobody
 * wants; the error is at most a few percent and always in the direction of
 * "you are slightly ahead".
 */
export function businessDaysInLocalMonth(
  now: Date,
  tz: string,
): { elapsed: number; total: number } {
  const { y, m, d: today } = localDate(now, tz);
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  let elapsed = 0;
  let total = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    // getUTCDay on a UTC-midnight date gives that calendar date's weekday.
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    total += 1;
    if (d <= today) elapsed += 1;
  }
  return { elapsed, total };
}

/** `2026-09-11` in the given zone — the key a calendar view groups by. */
export function localDateKey(at: Date, tz: string): string {
  const { y, m, d } = localDate(at, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The instant at which a local calendar date begins — the inverse of
 * `localDateKey`.
 *
 * A period is chosen as dates on a wall calendar ("September"), but entries
 * are stored as instants, so the boundary has to be resolved in the zone the
 * user meant. Treating `2026-09-01` as UTC puts the boundary in the middle of
 * the previous local evening for anyone west of Greenwich, which silently
 * moves work across it.
 *
 * Resolved by guessing UTC and correcting by the offset the guess lands in, so
 * the correction is computed *at* the target instant rather than assumed from
 * today — the same reason the rest of this file re-checks its offset.
 */
export function startOfLocalDate(date: string, tz: string): Date {
  return localDateTimeToInstant(date, '00:00', tz);
}

/**
 * The instant at which `date` (`YYYY-MM-DD`) and `time` (`HH:MM`) read on a
 * wall clock in `tz` — `startOfLocalDate` with a time of day.
 *
 * The entry editor's inputs are wall-clock and the API is UTC, so this is the
 * conversion between them, corrected the same way: never by a fixed number of
 * milliseconds, which lands an hour off across a DST transition.
 */
export function localDateTimeToInstant(
  date: string,
  time: string,
  tz: string,
): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = new Date(wall - tzOffset(new Date(wall), tz));
  guess = new Date(wall - tzOffset(guess, tz));
  return guess;
}

/** `date` stepped `n` days on the calendar rather than in milliseconds. */
export function addDays(date: string, n: number): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
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
