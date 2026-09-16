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

export interface LineItem {
  description: string;
  quantitySeconds: number;
  quantityHours: number;
  resolvedRate: number;
  rateSource: RateSource;
  amount: number;
  entryIds: string[];
}

export interface InvoiceTotals {
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
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
  opts: { groupingMode: GroupingMode; taxRate?: number; tz?: string },
): InvoiceTotals {
  const mode = opts.groupingMode;
  const tz = opts.tz ?? 'UTC';
  const taxRate = opts.taxRate ?? 0;

  const billable = entries.filter((e) => e.isBillable);
  const unratedEntryIds: string[] = [];
  const groups = new Map<string, LineItem>();

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

    if (existing) {
      existing.quantitySeconds += entry.durationSeconds;
      existing.entryIds.push(entry.id);
    } else {
      groups.set(key, {
        description: describe(entry, mode, tz),
        quantitySeconds: entry.durationSeconds,
        quantityHours: 0, // computed once the group is complete
        resolvedRate: rate,
        rateSource: resolveRateSource(ctx),
        amount: 0,
        entryIds: [entry.id],
      });
    }
  }

  /* Amounts come from the SUMMED seconds, so rounding happens once per line
     rather than accumulating: rounding per entry and adding drifts — 3 x
     20min at 100/h gives 99.99 rather than 100.00. Every rollup that reports
     the same money rounds once per bucket for this reason. */
  const lineItems = [...groups.values()].map((li) => ({
    ...li,
    quantityHours: toHours(li.quantitySeconds),
    amount: cents((li.quantitySeconds / 3600) * li.resolvedRate),
  }));

  // Deterministic order, so identical inputs always produce an identical
  // invoice. 'entry' mode keeps the chronological order it was given.
  if (mode !== 'entry') {
    lineItems.sort(
      (a, b) =>
        a.description.localeCompare(b.description) ||
        a.resolvedRate - b.resolvedRate,
    );
  }

  const subtotal = cents(lineItems.reduce((sum, li) => sum + li.amount, 0));
  const taxAmount = cents(subtotal * (taxRate / 100));

  return {
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total: cents(subtotal + taxAmount),
    entryCount: billable.length - unratedEntryIds.length,
    unratedEntryIds,
  };
}

/** `INV-0001` — zero-padded to 4, growing past 9999 rather than truncating. */
export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}
