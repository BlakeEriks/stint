/**
 * A draft holds the work it was built with and changes only when the owner
 * changes it. Work in its period that it doesn't hold is counted as new work
 * for the owner to add; work dated in a period already sent is surfaced
 * rather than billed on whichever invoice comes next.
 */

import { type BillingSchedule, lastEndedPeriod } from './billing-period.ts';
import { addDays, localDateKey } from './calendar.ts';
import {
  type BillableEntry,
  buildLineItems,
  type ExpenseInput,
  hundredths,
  termsDays,
} from './invoice.ts';

/** What a draft's last PDF printed that sending keeps: its dates, and the
 *  template it was drawn in. */
export interface PrintedDates {
  issueDate?: string;
  dueDate?: string | null;
  template?: string;
}

/** The work a draft's period would add to it: what a build takes that the
 *  draft doesn't hold, priced on its own at the draft's tax rate. Null when
 *  there is none. Only billable time counts: a build holds non-billable
 *  entries too, which bill nothing. A recurring expense is on every invoice
 *  and never new. */
export function newWork(
  held: { entryIds: readonly string[]; expenseIds: readonly string[] },
  built: {
    entries: readonly BillableEntry[];
    expenses: readonly (ExpenseInput & { recurring: boolean })[];
  },
  pricing: { taxRate: number; tz: string },
) {
  const heldEntries = new Set(held.entryIds);
  const heldExpenses = new Set(held.expenseIds);
  const entries = built.entries.filter(
    (e) => e.isBillable && !heldEntries.has(e.id),
  );
  const expenses = built.expenses.filter(
    (x) => !x.recurring && !heldExpenses.has(x.id),
  );
  if (entries.length === 0 && expenses.length === 0) return null;
  return {
    entries: entries.length,
    expenses: expenses.length,
    hours: entries.reduce((a, e) => a + hundredths(e.durationSeconds), 0) / 100,
    amount: buildLineItems(entries, {
      groupingMode: 'entry',
      taxRate: pricing.taxRate,
      tz: pricing.tz,
      expenses,
    }).total,
  };
}

interface LateCandidate {
  id: string;
  taskName: string;
  startedAt: string;
  durationSeconds: number;
  isBillable: boolean;
  clientId: string | null;
}

interface IssuedPeriod {
  id: string;
  invoiceNumber: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  /** The zone it was billed in; absent reads `tz`. */
  tz?: string | null;
}

/** Unbilled billable entries dated inside a sent or paid invoice's period
 *  for their client, read in that invoice's zone, else `tz`; oldest first. */
export function lateEntries(
  entries: LateCandidate[],
  invoices: IssuedPeriod[],
  tz: string,
) {
  return entries
    .filter((e) => e.isBillable && e.clientId)
    .flatMap((e) => {
      const invoice = invoices.find((i) => {
        const day = localDateKey(new Date(e.startedAt), i.tz ?? tz);
        return (
          i.clientId === e.clientId &&
          i.periodStart <= day &&
          day <= i.periodEnd
        );
      });
      return invoice
        ? [
            {
              entryId: e.id,
              taskName: e.taskName,
              startedAt: e.startedAt,
              hours: hundredths(e.durationSeconds) / 100,
              clientId: invoice.clientId,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              periodStart: invoice.periodStart,
              periodEnd: invoice.periodEnd,
            },
          ]
        : [];
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

interface DueInputs {
  /** The user's active clients; `schedule` null when none is set. */
  clients: { id: string; name: string; schedule: BillingSchedule | null }[];
  /** Finished entries on no invoice and not billed elsewhere. */
  entries: Omit<LateCandidate, 'taskName'>[];
  /** The user's non-void invoices: callers leave the void ones out. A
   *  draft says so in `status`; without one, an invoice is issued. */
  invoices: {
    clientId: string;
    periodStart: string;
    periodEnd: string;
    status?: string;
  }[];
}

type Period = { periodStart: string; periodEnd: string };

/** Whether an invoice takes the period off the list. A sent or paid one over
 *  any of it holds `lateEntries()`' work. A draft only when it spans it: a
 *  draft offers only its own period's work as new work, and two drafts may
 *  share dates, so the rest of the period would surface nowhere else. */
function covers(i: DueInputs['invoices'][number], period: Period) {
  return i.status === 'draft'
    ? i.periodStart <= period.periodStart && period.periodEnd <= i.periodEnd
    : i.periodStart <= period.periodEnd && period.periodStart <= i.periodEnd;
}

/**
 * Clients ready to invoice, one row each by name: those with a schedule whose
 * most recent ended period holds billable work and none of `invoices`
 * `covers()`.
 */
export function unbilledDue(
  { clients, entries, invoices }: DueInputs,
  today: string,
  tz: string,
) {
  return clients
    .flatMap((c) => {
      if (!c.schedule) return [];
      const period = lastEndedPeriod(today, c.schedule);
      const invoiced = invoices.some(
        (i) => i.clientId === c.id && covers(i, period),
      );
      if (invoiced) return [];
      const work = entries.filter((e) => {
        const day = localDateKey(new Date(e.startedAt), tz);
        return (
          e.isBillable &&
          e.clientId === c.id &&
          period.periodStart <= day &&
          day <= period.periodEnd
        );
      });
      if (work.length === 0) return [];
      return [
        {
          clientId: c.id,
          clientName: c.name,
          seconds: work.reduce((t, e) => t + e.durationSeconds, 0),
          ...period,
        },
      ];
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));
}

/**
 * The dates a draft shows when issued on `issueDate`: due on the date typed
 * for it, else after its terms. `sent` is what Mark sent dates it, its last
 * PDF's when it had one, since that is the copy the client holds.
 */
export function draftDates(d: {
  issueDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  defaultTermsDays: number;
  printed: PrintedDates | null;
}) {
  const dueDate =
    d.dueDate ??
    addDays(d.issueDate, termsDays(d.paymentTerms) ?? d.defaultTermsDays);
  const sent = d.printed?.issueDate
    ? {
        issueDate: d.printed.issueDate,
        dueDate: d.printed.dueDate ?? dueDate,
      }
    : { issueDate: d.issueDate, dueDate };
  return { issueDate: d.issueDate, dueDate, sent };
}
