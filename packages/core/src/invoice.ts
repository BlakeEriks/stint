/**
 * Invoice line-item construction.
 *
 * Pure, so the preview a user approves and the invoice that gets issued are
 * built by the same code, from the rates `resolveRate()` computes.
 */

import { resolveRate, resolveRateSource, type RateSource } from './rates.ts';
import { localDateKey } from './calendar.ts';

export type GroupingMode = 'entry' | 'task' | 'project' | 'day';

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

/** Decimal hours, 2dp — what appears on the invoice as the quantity. */
const toHours = (seconds: number): number =>
  Math.round((seconds / 3600) * 100) / 100;

function describe(
  entry: BillableEntry,
  mode: GroupingMode,
  tz: string,
): string {
  switch (mode) {
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
): string {
  if (mode === 'entry') return entry.id;
  return `${describe(entry, mode, tz)}\0${rate}`;
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

  const billable = entries.filter((e) => e.isBillable);
  const unratedEntryIds: string[] = [];
  const groups = new Map<string, LineItem>();
  /* Seconds are summed here rather than on the line, because the line stores
     decimal hours and adding those would round per entry. A 20-minute entry
     is 0.33h; three of them are 1.00h, not 0.99h. */
  const secondsByKey = new Map<string, number>();

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

    const key = groupKey(entry, mode, rate, tz);
    const existing = groups.get(key);

    secondsByKey.set(key, (secondsByKey.get(key) ?? 0) + entry.durationSeconds);

    if (existing) {
      existing.entryIds.push(entry.id);
    } else {
      groups.set(key, {
        description: describe(entry, mode, tz),
        unit: 'hour',
        quantity: 0, // computed once the group is complete
        unitPrice: rate,
        amount: 0,
        rateSource: resolveRateSource(ctx),
        entryIds: [entry.id],
      });
    }
  }

  /* Amounts come from the SUMMED seconds, so rounding happens once per line
     rather than accumulating: rounding per entry and adding drifts — 3 x
     20min at 100/h gives 99.99 rather than 100.00. Every rollup that reports
     the same money rounds once per bucket for this reason.

     The amount is computed from seconds, NOT from the rounded hours the line
     carries: 7.499h at 100/h bills 749.90, not 749.90 from a displayed 7.50.
     The printed quantity and the charge are derived from the same source, in
     that order. */
  const timeLines = [...groups.entries()].map(([key, li]) => {
    const seconds = secondsByKey.get(key) ?? 0;
    return {
      ...li,
      quantity: toHours(seconds),
      amount: cents((seconds / 3600) * li.unitPrice),
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
