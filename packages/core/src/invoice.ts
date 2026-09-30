/**
 * Invoice line-item construction.
 *
 * Pure, so the preview a user approves and the invoice that gets issued are
 * built by the same code, from the rates `resolveRate()` computes.
 */

import { resolveRate, resolveRateSource, type RateSource } from './rates.ts';
import { localDateKey } from './calendar.ts';

/**
 * `summary` is one line of the user's own text for all the time, split only
 * by rate, so accounts payable reads a total rather than a breakdown.
 */
export type GroupingMode = 'summary' | 'entry' | 'task' | 'project' | 'day';

export interface BillableEntry {
  id: string;
  taskName: string;
  projectId: string | null;
  projectName: string | null;
  startedAt: string;
  durationSeconds: number;
  isBillable: boolean;
  rateOverride: number | null;
  projectRate: number | null;
  clientRate: number | null;
  userDefaultRate: number | null;
}

/**
 * What a line's quantity MEANS.
 *
 * `hour` prints its quantity and unit price; `fixed` is a flat amount — a
 * fee, a deposit, a retainer — whose quantity is always 1 and whose quantity
 * and unit-price cells stay blank on the document. A client reading
 * "1 x $2,400.00" for a fixed-scope project learns nothing from the 1.
 * `expense` is flat the same way, and is a reimbursement rather than a
 * service: it sits in its own section, carries the day it was paid, and is
 * never taxed.
 */
export type LineUnit = 'hour' | 'fixed' | 'expense';

/**
 * One line, whatever it charges for.
 *
 * `quantity x unitPrice = amount` for every line, so there is one arithmetic
 * path and no column that is meaningful only for one variant. Time lines
 * carry decimal hours; a fixed line carries 1.
 */
export interface LineItem {
  description: string;
  unit: LineUnit;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** How the rate was derived. `manual` for anything the user typed. */
  rateSource: RateSource | 'manual';
  entryIds: string[];
  /** The day an expense was paid; expense lines only. */
  spentOn?: string;
  /** The expense an expense line bills; expense lines only. */
  expenseId?: string;
}

/** A charge the user entered by hand rather than one derived from time. */
export interface ManualLine {
  description: string;
  amount: number;
}

/** A cost the client reimburses, as stored and waiting to be billed. */
export interface ExpenseInput {
  id: string;
  spentOn: string;
  description: string;
  amount: number;
}

export interface InvoiceTotals {
  lineItems: LineItem[];
  /** Services — time and charges — and the base tax is charged on. */
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  /** Reimbursed expenses. Never taxed. */
  expensesSubtotal: number;
  total: number;
  entryCount: number;
  /** Billable entries with no rate at any level — these block generation. */
  unratedEntryIds: string[];
}

/** Money is rounded to cents exactly once, here. */
const cents = (n: number): number => Math.round(n * 100) / 100;

/**
 * Hundredths of an hour: the unit the document prints, and so the unit that
 * is billed. Rounded per entry, half up, which is what `round(s / 3600.0, 2)`
 * does in every rollup; `s / 36` is a correctly rounded division and its
 * halves are exact, so the two agree for every duration.
 */
const hundredths = (seconds: number): number =>
  Math.round(Math.max(0, seconds) / 36);

/**
 * `quantity x unitPrice`, in integers until the last division, so a half
 * cent is exact rather than a float's guess. 3603 s at $150 is 1.00 h at
 * $150.00 = $150.00 here; from raw seconds it was $150.125, which JS rounded
 * to .12 and Postgres to .13 (#191).
 */
const priced = (quantityHundredths: number, unitPrice: number): number =>
  // hundredths x cents = amount x 10,000; the first division leaves cents.
  Math.round((quantityHundredths * Math.round(unitPrice * 100)) / 100) / 100;

function describe(
  entry: BillableEntry,
  mode: GroupingMode,
  tz: string,
  summaryText: string,
): string {
  switch (mode) {
    case 'summary':
      return summaryText;
    case 'entry':
    case 'task':
      return entry.taskName || 'Untitled';
    case 'project':
      return entry.projectName ?? 'Unassigned';
    case 'day':
      return localDateKey(new Date(entry.startedAt), tz);
  }
}

/**
 * Grouping key.
 *
 * The rate is ALWAYS part of the key, even when grouping by task or day: two
 * entries with the same name but different rates must never collapse into one
 * line, because the resulting line would misstate the rate being charged.
 */
function groupKey(
  entry: BillableEntry,
  mode: GroupingMode,
  rate: number,
  tz: string,
  summaryText: string,
): string {
  if (mode === 'entry') return entry.id;
  return `${describe(entry, mode, tz, summaryText)}\0${rate}`;
}

/**
 * Builds line items from billable entries.
 *
 * Non-billable entries are excluded entirely — they never reach an invoice.
 * Entries with no resolvable rate are reported in `unratedEntryIds` rather
 * than silently billed at zero.
 */
export function buildLineItems(
  entries: BillableEntry[],
  opts: {
    groupingMode: GroupingMode;
    /** The one line's text in `summary` mode; ignored by the others. */
    summaryText?: string;
    taxRate?: number;
    tz?: string;
    /** Flat charges the user entered: fees, deposits, retainers. */
    manualLines?: ManualLine[];
    /** Unbilled expenses to reimburse on this invoice. */
    expenses?: ExpenseInput[];
  },
): InvoiceTotals {
  const mode = opts.groupingMode;
  const tz = opts.tz ?? 'UTC';
  const taxRate = opts.taxRate ?? 0;
  const summaryText = opts.summaryText ?? '';

  const billable = entries.filter((e) => e.isBillable);
  const unratedEntryIds: string[] = [];
  const groups = new Map<string, LineItem>();
  /* Hours are rounded per ENTRY and summed in hundredths, so a line's
     quantity is exactly the sum of what each entry prints, and the total is
     the same however the lines are grouped: three 20-minute entries are
     0.33 h each and 0.99 h together, on one line or three. */
  const hundredthsByKey = new Map<string, number>();

  for (const entry of billable) {
    const ctx = {
      entryRateOverride: entry.rateOverride,
      projectRate: entry.projectRate,
      clientRate: entry.clientRate,
      userDefaultRate: entry.userDefaultRate,
    };
    const rate = resolveRate(ctx);

    if (rate == null) {
      unratedEntryIds.push(entry.id);
      continue;
    }

    const key = groupKey(entry, mode, rate, tz, summaryText);
    const existing = groups.get(key);

    hundredthsByKey.set(
      key,
      (hundredthsByKey.get(key) ?? 0) + hundredths(entry.durationSeconds),
    );

    if (existing) {
      existing.entryIds.push(entry.id);
    } else {
      groups.set(key, {
        description: describe(entry, mode, tz, summaryText),
        unit: 'hour',
        quantity: 0, // computed once the group is complete
        unitPrice: rate,
        amount: 0,
        rateSource: resolveRateSource(ctx),
        entryIds: [entry.id],
      });
    }
  }

  /* The amount is the printed quantity times the printed rate, to the cent:
     the arithmetic a client checks on the document is the arithmetic that
     produced it (#195). Every rollup prices its bucket the same way, from
     the same per-entry hours, so the home screen and the invoice state one
     figure for the same work (#192). A rate carrying cents can still put a
     grouped line a cent from its bucket, since rounding once over 0.66 h is
     not rounding twice over 0.33 h; `rates.test.ts` bounds that. */
  const timeLines = [...groups.entries()].map(([key, li]) => {
    const quantityHundredths = hundredthsByKey.get(key) ?? 0;
    return {
      ...li,
      quantity: quantityHundredths / 100,
      amount: priced(quantityHundredths, li.unitPrice),
    };
  });

  // Deterministic order, so identical inputs always produce an identical
  // invoice. 'entry' mode keeps the chronological order it was given.
  if (mode !== 'entry') {
    timeLines.sort(
      (a, b) =>
        a.description.localeCompare(b.description) || a.unitPrice - b.unitPrice,
    );
  }

  /* Manual lines follow the time lines, in the order given, and are never
     sorted in among them. A fee is a separate statement from the work, and
     interleaving it alphabetically would bury it. */
  const manualLines: LineItem[] = (opts.manualLines ?? []).map((m) => ({
    description: m.description,
    unit: 'fixed' as const,
    quantity: 1,
    unitPrice: cents(m.amount),
    amount: cents(m.amount),
    rateSource: 'manual' as const,
    entryIds: [],
  }));

  const serviceLines = [...timeLines, ...manualLines];

  /* Expenses go after every service line, oldest first, in a section of
     their own: a reimbursement is a pass-through, not work, so it is
     subtotalled apart and tax never reaches it. The id breaks a tie so two
     expenses on one day always print in the same order. */
  const expenseLines: LineItem[] = [...(opts.expenses ?? [])]
    .sort(
      (a, b) => a.spentOn.localeCompare(b.spentOn) || a.id.localeCompare(b.id),
    )
    .map((e) => ({
      description: e.description,
      unit: 'expense' as const,
      quantity: 1,
      unitPrice: cents(e.amount),
      amount: cents(e.amount),
      rateSource: 'manual' as const,
      entryIds: [],
      spentOn: e.spentOn,
      expenseId: e.id,
    }));

  const subtotal = cents(serviceLines.reduce((sum, li) => sum + li.amount, 0));
  const taxAmount = cents(subtotal * (taxRate / 100));
  const expensesSubtotal = cents(
    expenseLines.reduce((sum, li) => sum + li.amount, 0),
  );

  return {
    lineItems: [...serviceLines, ...expenseLines],
    subtotal,
    taxRate,
    taxAmount,
    expensesSubtotal,
    total: cents(subtotal + taxAmount + expensesSubtotal),
    entryCount: billable.length - unratedEntryIds.length,
    unratedEntryIds,
  };
}

/** `INV-0001` — zero-padded to 4, growing past 9999 rather than truncating. */
export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}
