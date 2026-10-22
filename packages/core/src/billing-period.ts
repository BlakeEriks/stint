/**
 * A client's billing schedule and the periods it bills. One rule,
 * `periodContaining()`, decides every period: the new invoice's default and
 * the off-schedule hint derive from it, so they cannot disagree.
 */

import { addDays, daysInMonth } from './calendar.ts';

export const BILLING_PERIODS = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/** Each schedule's name, wherever it is shown. */
export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly',
};

/** What each schedule bills, under its name where one is picked. */
export const BILLING_PERIOD_DETAILS: Record<BillingPeriod, string> = {
  weekly: 'Every week, from a start date',
  biweekly: 'Every two weeks, from a start date',
  semimonthly: 'Twice a month: 1st–15th and 16th–end',
  monthly: 'The calendar month',
};

/** Weekly and biweekly count from an anchor; the others are calendar
 *  periods. */
export const needsAnchor = (
  period: BillingPeriod,
): period is 'weekly' | 'biweekly' =>
  period === 'weekly' || period === 'biweekly';

/** Weekly and biweekly count from `anchor`, a date one period starts on. */
export type BillingSchedule =
  | { period: 'weekly' | 'biweekly'; anchor: string }
  | { period: 'semimonthly' | 'monthly' };

export interface Period {
  periodStart: string;
  periodEnd: string;
}

const DAY = 86_400_000;

/** The `schedule` period holding `date` (`YYYY-MM-DD`). */
export function periodContaining(
  date: string,
  schedule: BillingSchedule,
): Period {
  if ('anchor' in schedule) {
    const length = schedule.period === 'weekly' ? 7 : 14;
    const days = (Date.parse(date) - Date.parse(schedule.anchor)) / DAY;
    // Floor, so a date before the anchor lands in an earlier period.
    const periodStart = addDays(
      schedule.anchor,
      Math.floor(days / length) * length,
    );
    return { periodStart, periodEnd: addDays(periodStart, length - 1) };
  }
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const month = date.slice(0, 8);
  const last = `${month}${daysInMonth(y, m)}`;
  if (schedule.period === 'monthly')
    return { periodStart: `${month}01`, periodEnd: last };
  return d <= 15
    ? { periodStart: `${month}01`, periodEnd: `${month}15` }
    : { periodStart: `${month}16`, periodEnd: last };
}

/** The most recent period that has ended by `today`; the one holding today
 *  is still open, even on its last day. */
export function lastEndedPeriod(
  today: string,
  schedule: BillingSchedule,
): Period {
  const current = periodContaining(today, schedule);
  return periodContaining(addDays(current.periodStart, -1), schedule);
}

/** Whether `periodStart`..`periodEnd` is exactly one of `schedule`'s periods. */
export function isPeriod(
  schedule: BillingSchedule,
  periodStart: string,
  periodEnd: string,
): boolean {
  const period = periodContaining(periodStart, schedule);
  return period.periodStart === periodStart && period.periodEnd === periodEnd;
}
