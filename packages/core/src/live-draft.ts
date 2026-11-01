/**
 * A draft holds the work it was built with and changes only when the owner
 * changes it. Work in its period that it doesn't hold is counted as new work
 * for the owner to add; work dated in a period already sent is surfaced
 * rather than billed on whichever invoice comes next.
 */

import { addDays, localDateKey } from './calendar.ts';
import { hundredths, termsDays } from './invoice.ts';

const cents = (n: number) => Math.round(n * 100) / 100;

/** What a draft's last PDF printed that sending keeps: its dates, and the
 *  template it was drawn in. */
export interface PrintedDates {
  issueDate?: string;
  dueDate?: string | null;
  template?: string;
}

/** The work a draft's period would add to it: what a build takes that the
 *  draft doesn't hold. Null when there is none. Only billable time counts:
 *  a build holds non-billable entries too, which bill nothing. */
export function newWork(
  held: {
    entryIds: readonly string[];
    expenseIds: readonly string[];
    total: number;
  },
  built: {
    entries: readonly {
      id: string;
      isBillable: boolean;
      durationSeconds: number;
    }[];
    expenseIds: readonly string[];
    total: number;
  },
) {
  const heldEntries = new Set(held.entryIds);
  const heldExpenses = new Set(held.expenseIds);
  const entries = built.entries.filter(
    (e) => e.isBillable && !heldEntries.has(e.id),
  );
  const expenses = built.expenseIds.filter((id) => !heldExpenses.has(id));
  if (entries.length === 0 && expenses.length === 0) return null;
  return {
    entries: entries.length,
    expenses: expenses.length,
    hours: entries.reduce((a, e) => a + hundredths(e.durationSeconds), 0) / 100,
    amount: cents(built.total - held.total),
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
}

/** Unbilled billable entries dated, in `tz`, inside a sent or paid
 *  invoice's period for their client; oldest first. */
export function lateEntries(
  entries: LateCandidate[],
  invoices: IssuedPeriod[],
  tz: string,
) {
  return entries
    .filter((e) => e.isBillable && e.clientId)
    .flatMap((e) => {
      const day = localDateKey(new Date(e.startedAt), tz);
      const invoice = invoices.find(
        (i) =>
          i.clientId === e.clientId &&
          i.periodStart <= day &&
          day <= i.periodEnd,
      );
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
