/**
 * What an invoice bills, over plain rows. The route queries narrowly and
 * then applies these; the fake API (`apps/web/src/mocks/derive.ts`) applies
 * them to its arrays, so a rule changed here changes both.
 */
import { addDays, localDateKey, startOfLocalDate } from './calendar.ts';
import type { ExpenseInput } from './invoice.ts';

/**
 * The zone an invoice reads its period, issue date and due date in: the
 * account's billing zone, else the device's. A traveller's device zone would
 * move work near midnight between invoices, so it is only the fallback for an
 * account that has never set one.
 */
export function billingZone<Device extends string | undefined>(
  account: { billingTimeZone?: string | null } | null | undefined,
  device: Device,
): string | Device {
  return account?.billingTimeZone ?? device;
}

/**
 * The instants a period of local dates covers: from its first day's start to
 * the start of the day after its last. A user picks "September" on a wall
 * calendar, and the invoice groups by local day, so a UTC window would drop
 * or borrow an evening at each end. The end steps the calendar, not 24
 * hours, since a day with a DST change is 23 or 25 hours long.
 */
export function billingWindow(
  periodStart: string,
  periodEnd: string,
  tz: string,
) {
  return {
    start: startOfLocalDate(periodStart, tz),
    end: startOfLocalDate(addDays(periodEnd, 1), tz),
  };
}

/** Whether an invoice for the window bills the entry: stopped, since time
    still accruing can't be billed, billed nowhere yet, and started in it. */
export function isBillableEntry(
  e: {
    invoiceId: string | null;
    invoicedElsewhere: boolean;
    endedAt: string | null;
    startedAt: string;
  },
  window: { start: Date; end: Date },
): boolean {
  const started = new Date(e.startedAt).getTime();
  return (
    e.invoiceId === null &&
    !e.invoicedElsewhere &&
    e.endedAt !== null &&
    started >= window.start.getTime() &&
    started < window.end.getTime()
  );
}

/** How far a client's first invoice looks back for earlier work: about a
    monthly period, so it never offers a client's whole history. */
const FIRST_LOOKBACK_DAYS = 30;

/**
 * The first day New invoice looks for unbilled work before `periodStart`:
 * the day after the client's last invoice ending before it, else 30 days
 * back. `invoiceEnds` are the client's non-void invoices' period ends.
 */
export function earlierWorkFrom(periodStart: string, invoiceEnds: string[]) {
  const last = invoiceEnds
    .filter((end) => end < periodStart)
    .sort()
    .at(-1);
  return last ? addDays(last, 1) : addDays(periodStart, -FIRST_LOOKBACK_DAYS);
}

/**
 * What New invoice offers of the billable entries dated from
 * `earlierWorkFrom()` to the period: those no draft holds, which Include
 * bills, else those one draft holds, which it names. The count and dates,
 * each entry dated by its day in `tz`.
 */
export function earlierWork(
  entries: { startedAt: string; draftId: string | null }[],
  tz: string,
) {
  const free = entries.filter((e) => e.draftId === null);
  const shown =
    free.length > 0
      ? free
      : entries.filter((e) => e.draftId === entries[0]?.draftId);
  if (shown.length === 0) return null;
  const days = shown.map((e) => localDateKey(new Date(e.startedAt), tz)).sort();
  return {
    entryCount: shown.length,
    from: days[0]!,
    to: days.at(-1)!,
    draftId: shown[0]!.draftId,
  };
}

export interface ExpenseRow {
  id: string;
  recurring: boolean;
  /** Null only for a recurring expense, which has no date of its own. */
  spentOn: string | null;
  description: string;
  amount: number;
  invoiceId: string | null;
  /** The draft holding it; a recurring expense is never held. */
  draftId: string | null;
}

/**
 * What a draft bills of the client's unbilled expenses: every recurring one
 * it didn't leave off, and of the one-offs, those it `held`, else those a
 * build takes: held by no other draft, dated by the period's end, and not
 * left off. An earlier month's one-off is included, so one missed invoice
 * does not strand a reimbursement.
 *
 * A recurring line takes the period's last day, the date the invoice claims
 * to cover; `recurring` tells the caller not to hold or claim it, since it
 * bills again on the next invoice.
 */
export function billableExpenses(
  rows: ExpenseRow[],
  draft: { id?: string; periodEnd: string; excludedExpenseIds: string[] },
  held: boolean,
): Array<ExpenseInput & { recurring: boolean }> {
  const mine = (r: ExpenseRow) => draft.id != null && r.draftId === draft.id;
  return rows
    .filter((r) => r.invoiceId === null)
    .filter((r) => !draft.excludedExpenseIds.includes(r.id))
    .filter((r) => {
      if (r.recurring) return true;
      if (held) return mine(r);
      return (r.draftId === null || mine(r)) && r.spentOn! <= draft.periodEnd;
    })
    .map((r) => ({
      id: r.id,
      recurring: r.recurring,
      spentOn: r.spentOn ?? draft.periodEnd,
      description: r.description,
      amount: r.amount,
    }));
}
