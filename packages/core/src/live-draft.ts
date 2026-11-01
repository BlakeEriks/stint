/**
 * A draft keeps collecting its period's work until it is marked sent. What
 * the client was given is the PDF last rendered, so a snapshot of it says
 * whether the draft has moved on since; and work dated in a period already
 * sent is surfaced rather than billed on whichever invoice comes next.
 */

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
  /** What else it printed that an edit can change; absent on a snapshot
   *  recorded before edits existed. */
  printed?: Printed;
}

/** A draft's choices as its PDF printed them, besides its lines. */
export interface Printed {
  periodStart: string;
  periodEnd: string;
  /** The due date typed, not the one the terms date: that moves every day. */
  typedDueDate: string | null;
  notes: string | null;
  reference: string | null;
  paymentDetails: unknown;
  supportingDetail: unknown;
  tz: string | null;
}

/** Each printed field in the words the draft's notice uses. */
const PRINTED: Record<keyof Printed, string> = {
  periodStart: 'dates',
  periodEnd: 'dates',
  typedDueDate: 'due date',
  notes: 'notes',
  reference: 'reference',
  paymentDetails: 'payment details',
  supportingDetail: 'attachments',
  tz: 'time zone',
};

/** Content, not key order: Postgres stores the JSON as jsonb, which keeps
 *  none. */
const canonical = (v: unknown) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : x,
  );

export function draftSnapshot(
  lines: Line[],
  total: number,
  printed?: Printed,
): DraftSnapshot {
  return {
    ...(printed ? { printed } : {}),
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
  /** The printed fields edited since, by name. */
  edited: string[];
} | null {
  if (!before) return null;
  const same =
    before.total === now.total &&
    before.lines.length === now.lines.length &&
    before.lines.every((l, i) => key(l) === key(now.lines[i]!));
  const edited = editedFields(before.printed, now.printed);
  if (same && edited.length === 0) return null;
  return {
    hours: { from: before.hours, to: now.hours },
    total: { from: before.total, to: now.total },
    edited,
  };
}

/** The printed fields that differ; a field `before` lacks is unchanged. */
function editedFields(before: Printed | undefined, now: Printed | undefined) {
  if (!before || !now) return [];
  const names = (Object.keys(PRINTED) as (keyof Printed)[])
    .filter((k) => k in before && canonical(before[k]) !== canonical(now[k]))
    .map((k) => PRINTED[k]);
  return [...new Set(names)];
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
