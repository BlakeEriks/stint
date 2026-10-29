/**
 * A draft keeps collecting its period's work until it is marked sent. What
 * the client was given is the PDF last rendered, so a snapshot of it says
 * whether the draft has moved on since; and work dated in a period already
 * sent is surfaced rather than billed on whichever invoice comes next.
 */

import {
  type BillingSchedule,
  type Period,
  periodContaining,
} from './billing-period.ts';
import { addDays, localDateKey } from './calendar.ts';
import { hundredths, type LineItem, termsDays } from './invoice.ts';

const cents = (n: number) => Math.round(n * 100) / 100;

type Line = Pick<LineItem, 'description' | 'unit' | 'quantity' | 'amount'>;

export interface DraftSnapshot {
  total: number;
  hours: number;
  lines: { description: string; quantity: number; amount: number }[];
  /** The dates the PDF printed, which sending keeps; absent on a snapshot
   *  only compared. */
  issueDate?: string;
  dueDate?: string | null;
  /** The template the PDF printed in, which sending keeps. */
  template?: string;
}

export function draftSnapshot(lines: Line[], total: number): DraftSnapshot {
  return {
    total,
    hours: cents(
      lines
        .filter((l) => l.unit === 'hour')
        .reduce((a, l) => a + l.quantity, 0),
    ),
    lines: lines.map(({ description, quantity, amount }) => ({
      description,
      quantity,
      amount,
    })),
  };
}

const key = (l: { description: string; quantity: number; amount: number }) =>
  JSON.stringify([l.description, l.quantity, l.amount]);

/** How the draft moved since `before` was rendered; null when it hasn't, or
 *  was never rendered. */
export function snapshotChanged(
  before: DraftSnapshot | null,
  now: DraftSnapshot,
): {
  hours: { from: number; to: number };
  total: { from: number; to: number };
} | null {
  if (!before) return null;
  const same =
    before.total === now.total &&
    before.lines.length === now.lines.length &&
    before.lines.every((l, i) => key(l) === key(now.lines[i]!));
  if (same) return null;
  return {
    hours: { from: before.hours, to: now.hours },
    total: { from: before.total, to: now.total },
  };
}

/** For each line, whether `before` lacked it; each line of `before` matches
 *  at most one. */
export function newLines(
  before: DraftSnapshot | null,
  lines: Line[],
): boolean[] {
  if (!before) return lines.map(() => false);
  const left = new Map<string, number>();
  for (const l of before.lines) left.set(key(l), (left.get(key(l)) ?? 0) + 1);
  return lines.map((l) => {
    const n = left.get(key(l)) ?? 0;
    if (n === 0) return true;
    left.set(key(l), n - 1);
    return false;
  });
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
 * How old unbilled work of a client with no billing schedule gets before the
 * Inbox asks about it: a month, the longest period any schedule bills, so
 * someone who bills monthly without saying so is not asked before her month
 * is up.
 */
export const UNBILLED_DUE_DAYS = 30;

interface DueInputs {
  /** The user's active clients; `schedule` null when none is set. */
  clients: { id: string; name: string; schedule: BillingSchedule | null }[];
  /** Finished entries on no invoice and not billed elsewhere. */
  entries: Omit<LateCandidate, 'taskName'>[];
  invoices: {
    clientId: string;
    status: string;
    periodStart: string;
    periodEnd: string;
  }[];
}

/** The oldest span of `units` (in date order) that `joins` lets grow. */
function firstRun(
  units: Period[],
  joins: (span: Period, next: Period) => boolean,
): Period {
  let span = units[0]!;
  for (const next of units) {
    if (next.periodStart <= span.periodEnd) continue;
    if (!joins(span, next)) break;
    span = { periodStart: span.periodStart, periodEnd: next.periodEnd };
  }
  return span;
}

/**
 * Billable work past due to bill, one row per client, oldest first: for a
 * scheduled client, work in any period that has ended; for any other, work
 * more than `UNBILLED_DUE_DAYS` old. Work inside an invoice that isn't void
 * is never due: a draft will bill it, and one inside a sent or paid period
 * is `lateEntries()`' row, so no entry is flagged twice.
 *
 * `periodStart`..`periodEnd` span the oldest run of that work, in whole
 * periods for a scheduled client; `onePeriod` says all of it is in one.
 */
export function unbilledDue(
  { clients, entries, invoices }: DueInputs,
  today: string,
  tz: string,
) {
  const cutoff = addDays(today, -UNBILLED_DUE_DAYS);
  return clients
    .flatMap((c) => {
      const covered = (day: string) =>
        invoices.some(
          (i) =>
            i.clientId === c.id &&
            i.status !== 'void' &&
            i.periodStart <= day &&
            day <= i.periodEnd,
        );
      const isDue = (day: string) =>
        c.schedule
          ? periodContaining(day, c.schedule).periodEnd < today
          : day < cutoff;
      const work = entries
        .filter((e) => e.isBillable && e.clientId === c.id)
        .map((e) => ({ ...e, day: localDateKey(new Date(e.startedAt), tz) }))
        .filter((e) => isDue(e.day) && !covered(e.day))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      if (work.length === 0) return [];
      const schedule = c.schedule;
      const units = work.map((e) =>
        schedule
          ? periodContaining(e.day, schedule)
          : { periodStart: e.day, periodEnd: e.day },
      );
      /* A scheduled run is adjacent periods; any other stops at an invoice
         between two days of work. Either way the link never spans an
         invoice, which New invoice would refuse or sweep into the new one. */
      const joins = (span: Period, next: Period) =>
        schedule
          ? next.periodStart === addDays(span.periodEnd, 1)
          : !invoices.some(
              (i) =>
                i.clientId === c.id &&
                i.status !== 'void' &&
                i.periodEnd > span.periodEnd &&
                i.periodStart < next.periodStart,
            );
      return [
        {
          clientId: c.id,
          clientName: c.name,
          entryIds: work.map((e) => e.id),
          seconds: work.reduce((t, e) => t + e.durationSeconds, 0),
          since: work[0]!.day,
          ...firstRun(units, joins),
          onePeriod:
            schedule !== null &&
            units.every((u) => u.periodStart === units[0]!.periodStart),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.since.localeCompare(b.since) ||
        a.clientName.localeCompare(b.clientName),
    );
}

export interface OpenDraft {
  id: string;
  periodEnd: string;
  excludedExpenseIds: string[];
}

/**
 * The open draft each unbilled one-off expense shows on: of the client's
 * drafts that haven't left it off, the one with the earliest period end on
 * or after its date. One dated after every period waits for a later invoice.
 * Every read assigns from the same set, so two drafts never show one expense.
 */
export function assignExpenses(
  expenses: { id: string; spentOn: string }[],
  drafts: OpenDraft[],
): Map<string, string> {
  const byEnd = [...drafts].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );
  const assigned = new Map<string, string>();
  for (const e of expenses) {
    const draft = byEnd.find(
      (d) => d.periodEnd >= e.spentOn && !d.excludedExpenseIds.includes(e.id),
    );
    if (draft) assigned.set(e.id, draft.id);
  }
  return assigned;
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
  printed: DraftSnapshot | null;
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
