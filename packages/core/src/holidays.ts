/** Which days Home's month projection counts. */
export const PROJECTION_DAYS = [
  'every_day',
  'weekdays',
  'weekdays_except_holidays',
] as const;
export type ProjectionDays = (typeof PROJECTION_DAYS)[number];

const key = (d: Date) => d.toISOString().slice(0, 10);

/** The `n`th `weekday` (0=Sun) of a month; `n` of -1 is the last. */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  if (n < 0) {
    const last = new Date(Date.UTC(y, m, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return new Date(Date.UTC(y, m - 1, last.getUTCDate() - back));
  }
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return new Date(
    Date.UTC(y, m - 1, 1 + ((weekday - first + 7) % 7) + 7 * (n - 1)),
  );
}

/** A fixed date, moved off the weekend: Saturday to Friday, Sunday to Monday. */
function observed(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  const shift = { 0: 1, 6: -1 }[date.getUTCDay()] ?? 0;
  return new Date(Date.UTC(y, m - 1, d + shift));
}

function holidaysOf(y: number) {
  return [
    observed(y, 1, 1),
    nthWeekday(y, 1, 1, 3),
    nthWeekday(y, 2, 1, 3),
    nthWeekday(y, 5, 1, -1),
    observed(y, 6, 19),
    observed(y, 7, 4),
    nthWeekday(y, 9, 1, 1),
    nthWeekday(y, 10, 1, 2),
    observed(y, 11, 11),
    nthWeekday(y, 11, 4, 4),
    observed(y, 12, 25),
  ].map(key);
}

/**
 * The 11 US federal holidays (5 U.S.C. 6103) observed in a calendar year,
 * as `YYYY-MM-DD`, in order. Observed is OPM's rule, so a New Year's on a
 * Saturday falls on December 31 of the year before.
 */
export function observedFederalHolidays(year: number): string[] {
  const prefix = `${year}-`;
  return [...holidaysOf(year), ...holidaysOf(year + 1)].filter((d) =>
    d.startsWith(prefix),
  );
}
