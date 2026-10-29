/**
 * What an invoice bills, over plain rows. The route queries narrowly and
 * then applies these; the fake API (`apps/web/src/mocks/derive.ts`) applies
 * them to its arrays, so a rule changed here changes both.
 */
import { addDays, startOfLocalDate } from './calendar.ts';
import type { ExpenseInput } from './invoice.ts';
import { assignExpenses, type OpenDraft } from './live-draft.ts';

/**
 * The zone an invoice for a client reads its period, issue date and due date
 * in: the client's billing zone, else the account's, else the device's. A
 * traveller's device zone would move work near midnight between invoices,
 * so it is only the fallback for an account that has never set one.
 */
export function billingZone<Device extends string | undefined>(
  client: { billingTimeZone?: string | null } | null | undefined,
  account: { billingTimeZone?: string | null } | null | undefined,
  device: Device,
): string | Device {
  return client?.billingTimeZone ?? account?.billingTimeZone ?? device;
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

export interface ExpenseRow {
  id: string;
  recurring: boolean;
  /** Null only for a recurring expense, which has no date of its own. */
  spentOn: string | null;
  description: string;
  amount: number;
  invoiceId: string | null;
}

/**
 * What a draft bills of the client's unbilled expenses: every recurring one,
 * and the one-offs `assignExpenses` gives it among the client's open drafts,
 * less the ones the user left off. An earlier month's one-off is included,
 * so one missed invoice does not strand a reimbursement.
 *
 * A recurring line takes the period's last day, the date the invoice claims
 * to cover; `recurring` tells the caller not to claim it, since it bills
 * again on the next invoice.
 */
export function billableExpenses(
  rows: ExpenseRow[],
  draft: OpenDraft,
  openDrafts: OpenDraft[],
): Array<ExpenseInput & { recurring: boolean }> {
  const unbilled = rows.filter((r) => r.invoiceId === null);
  const assigned = assignExpenses(
    unbilled.flatMap((r) =>
      r.recurring ? [] : [{ id: r.id, spentOn: r.spentOn as string }],
    ),
    [...openDrafts.filter((d) => d.id !== draft.id), draft],
  );
  return unbilled
    .filter((r) =>
      r.recurring
        ? !draft.excludedExpenseIds.includes(r.id)
        : assigned.get(r.id) === draft.id,
    )
    .map((r) => ({
      id: r.id,
      recurring: r.recurring,
      spentOn: r.spentOn ?? draft.periodEnd,
      description: r.description,
      amount: r.amount,
    }));
}
