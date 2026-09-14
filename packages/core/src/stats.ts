/**
 * The home screen's figures, built from loaded rows.
 *
 * Pure: the route parses the query, loads, and hands the rows here. Money,
 * not hours, wherever a figure can be money — this app resolves rates and
 * owns the invoice table, so it can answer the question a contractor
 * actually asks. Unbillable work has no rate by definition and reports hours
 * alone.
 */

import { businessDaysInLocalMonth } from './calendar.ts';

/** A draft left this long is usually forgotten, not deliberate. */
export const STALE_DRAFT_DAYS = 7;

/**
 * Days past the due date before an invoice is "overdue" here.
 *
 * Firing the moment `due_date` passes is technically accurate and practically
 * noise: Net 30 terms and a client who pays on day 32 is ordinary, and a card
 * that flags it trains the user to clear the list without reading it — which
 * is how the one genuinely late invoice gets dismissed with the rest.
 *
 * Seven days is when a polite person starts wondering. The invoice detail
 * page still shows the true due date; this only governs when the card speaks
 * up.
 */
export const OVERDUE_GRACE_DAYS = 7;

/** Beyond this the card stops being a prompt and becomes a list. */
export const MAX_UNBILLED_ROWS = 5;

export interface UnprojectedRow {
  id: string;
  task_name: string;
  started_at: string;
  duration_seconds: number | null;
}

export interface DurationRow extends UnprojectedRow {
  project_id: string | null;
}

export interface UnbilledRow {
  client_id: string | null;
  client_name: string | null;
  currency: string | null;
  seconds: string | number;
  amount: string | number;
  unrated_count: string | number;
  oldest_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  client_id: string;
  status: string;
  due_date: string | null;
  total: string | number;
  currency: string | null;
  issue_date: string;
}

export interface MonthRow {
  duration_seconds: number | null;
  is_billable: boolean;
}

/** Project id -> its name and its client's, for the qualifier line. */
export type ProjectNames = Map<
  string,
  { name: string; clientName: string | null }
>;

/** Cents, so a sum of rounded lines stays a valid `money`. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * A scalar-returning `rpc` result as a number.
 *
 * PostgREST unwraps a scalar function to the value itself, while a plain
 * `select * from fn()` — which the route tests' shim runs — yields a one-row,
 * one-column set. Both shapes reach this, and `Number([{...}])` is `NaN`, so
 * the figure is normalised here rather than at the call site.
 *
 * Numerics arrive as strings either way.
 */
export function scalar(data: unknown): number {
  const v = Array.isArray(data) ? Object.values(data[0] ?? {})[0] : data;
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Whole days between two `YYYY-MM-DD` keys. Months are 1-based in a key. */
export function daysBetweenKeys(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function daysSince(iso: string, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000),
  );
}

/**
 * Unbilled work, per client and in total.
 *
 * The rollup groups by (client, rate) — one client can have work at several
 * rates, and collapsing them to one misstates the money. The totals sum every
 * row; `byClient` shows the first few.
 *
 * Each row's amount is already rounded, so the sum rounds once more: adding
 * rounded lines lands fractions of a cent below the last place and the
 * response would not be `money`.
 */
export function buildUnbilled(
  rows: UnbilledRow[],
  fallbackCurrency: string,
  now: Date,
) {
  return {
    /** Never "earned" or "revenue": work done and not yet invoiced. */
    total: roundMoney(rows.reduce((a, r) => a + Number(r.amount), 0)),
    seconds: rows.reduce((a, r) => a + Number(r.seconds), 0),
    byClient: rows.slice(0, MAX_UNBILLED_ROWS).map((r) => ({
      clientId: r.client_id,
      // Work with no client is internal; the UI must not render a blank name.
      clientName: r.client_name ?? 'No client',
      currency: r.currency ?? fallbackCurrency,
      seconds: Number(r.seconds),
      amount: Number(r.amount),
      unratedCount: Number(r.unrated_count),
      // The aging figure is the insight: a total is a fact, a total with
      // "oldest 22 days" is a prompt.
      oldestDays: daysSince(r.oldest_at, now),
    })),
    moreClients: Math.max(0, rows.length - MAX_UNBILLED_ROWS),
  };
}

/**
 * Invoiced and not yet collected.
 *
 * DELIBERATELY separate from `unbilled`: that is work not yet invoiced, this
 * is money already asked for, and summing the two would double-count the same
 * hours.
 */
export function buildAwaitingPayment(invoices: InvoiceRow[]): number {
  return roundMoney(
    invoices
      .filter((i) => i.status === 'sent')
      .reduce((a, i) => a + Number(i.total), 0),
  );
}

/** Invoices far enough past due to be worth saying so, most overdue first. */
export function buildOverdueInvoices(
  invoices: InvoiceRow[],
  clientNames: Map<string, string>,
  fallbackCurrency: string,
  todayKey: string,
  cutoffKey: string,
) {
  return invoices
    .filter(
      (i) =>
        i.status === 'sent' && i.due_date != null && i.due_date < cutoffKey,
    )
    .map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoice_number,
      clientId: i.client_id,
      clientName: clientNames.get(i.client_id) ?? null,
      amount: Number(i.total),
      currency: i.currency ?? fallbackCurrency,
      daysLate: daysBetweenKeys(i.due_date as string, todayKey),
    }))
    .sort((a, b) => b.daysLate - a.daysLate);
}

/** Drafts old enough to be forgotten rather than pending, oldest first. */
export function buildStaleDrafts(
  invoices: InvoiceRow[],
  clientNames: Map<string, string>,
  fallbackCurrency: string,
  todayKey: string,
  cutoffKey: string,
) {
  return invoices
    .filter((i) => i.status === 'draft' && i.issue_date < cutoffKey)
    .map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoice_number,
      clientId: i.client_id,
      clientName: clientNames.get(i.client_id) ?? null,
      amount: Number(i.total),
      currency: i.currency ?? fallbackCurrency,
      ageDays: daysBetweenKeys(i.issue_date, todayKey),
    }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * One row per unprojected entry, oldest first.
 *
 * Not a rollup: the work is done one entry at a time — open it, assign a
 * project, move to the next — and a row naming a count is a row the user then
 * has to go and find. Oldest first because that entry is closest to being
 * invoiced without a rate.
 *
 * Uncapped, deliberately. The other rows carry grace periods that keep them
 * rare; this one does not, so a long list is a true report of a real mess.
 */
export function buildUnprojected(rows: UnprojectedRow[]) {
  return rows.map((r) => ({
    entryId: r.id,
    taskName: r.task_name,
    startedAt: r.started_at,
    seconds: r.duration_seconds ?? 0,
  }));
}

/**
 * Entries whose length is implausible — one row each, short or long.
 *
 * Both thresholds are opt-in: null retires that side, and null on both retires
 * the row entirely, which is the default. Nobody gets a new inbox row without
 * asking for it.
 *
 * `kind` is what the row's qualifier states in words. Colour marks severity;
 * it never carries the meaning on its own.
 *
 * **An entry already surfaced as unprojected never appears here too.** Both
 * facts are true of it, but they are one entry and one decision — two rows
 * about the same record read as the inbox repeating itself. Unprojected wins
 * because it blocks invoicing: an entry with no project cannot resolve a rate
 * at all, where an implausible length still bills.
 */
export function buildStrangeDurations(
  rows: DurationRow[],
  minSeconds: number | null,
  maxHours: number | null,
  projects: ProjectNames,
  alreadyShown: ReadonlySet<string>,
) {
  if (minSeconds == null && maxHours == null) return [];
  const maxSeconds = maxHours == null ? null : maxHours * 3600;

  const out = [];
  for (const r of rows) {
    if (alreadyShown.has(r.id)) continue;
    const s = r.duration_seconds;
    if (s == null) continue;
    const kind =
      minSeconds != null && s < minSeconds
        ? ('short' as const)
        : maxSeconds != null && s > maxSeconds
          ? ('long' as const)
          : null;
    if (!kind) continue;
    const p = r.project_id ? projects.get(r.project_id) : undefined;
    out.push({
      entryId: r.id,
      kind,
      taskName: r.task_name,
      projectName: p?.name ?? null,
      clientName: p?.clientName ?? null,
      startedAt: r.started_at,
      seconds: s,
    });
  }
  return out;
}

/** Month-to-date seconds, total and billable, for Pace and the ratio. */
export function buildMonthTotals(rows: MonthRow[]) {
  return {
    monthSeconds: rows.reduce((a, r) => a + (r.duration_seconds ?? 0), 0),
    billableSeconds: rows.reduce(
      (a, r) => a + (r.is_billable ? (r.duration_seconds ?? 0) : 0),
      0,
    ),
  };
}

/** Null when nothing was tracked this month — 0/0 is not 0%. */
export function buildBillableRatio(
  monthSeconds: number,
  billableSeconds: number,
): number | null {
  return monthSeconds === 0 ? null : billableSeconds / monthSeconds;
}

/**
 * Pace against the monthly target, or null when none is set — the card hides
 * entirely rather than rendering an empty bar that asks to be configured.
 */
export function buildPace({
  target,
  unit,
  monthSeconds,
  monthRevenue,
  now,
  tz,
}: {
  target: string | number | null | undefined;
  unit: string | null | undefined;
  monthSeconds: number;
  monthRevenue: number;
  now: Date;
  tz: string;
}) {
  if (target == null || unit == null) return null;

  const goal = Number(target);
  const { elapsed, total } = businessDaysInLocalMonth(now, tz);

  // A month whose 1st falls on a weekend has zero business days elapsed that
  // day. Dividing by it would report any target as infinitely behind.
  const expected = total === 0 ? 0 : goal * (Math.max(elapsed, 1) / total);

  const actual = unit === 'revenue' ? monthRevenue : monthSeconds / 3600;

  /* Revenue reports a figure but NOT a pace.

     Hours accrue evenly enough that business days elapsed predicts them.
     Revenue does not: it lands in steps as work is done at different rates,
     so "behind by $2,400" on the 3rd is arithmetic rather than a finding. The
     card shows the money against the target and withholds the delta, which is
     the honest half of the same figure. */
  if (unit === 'revenue') {
    return {
      unit,
      target: goal,
      actual,
      expected: null,
      delta: null,
      businessDaysElapsed: elapsed,
      businessDaysTotal: total,
    };
  }

  return {
    unit,
    target: goal,
    actual,
    expected,
    /** Positive is ahead. Spelled out, not left to a bar to imply. */
    delta: actual - expected,
    businessDaysElapsed: elapsed,
    businessDaysTotal: total,
  };
}

/**
 * Client names, from the unbilled rollup.
 *
 * The rollup only returns clients with unbilled work, so an invoiced-and-quiet
 * client is absent from it; the UI falls back to its own client list.
 */
export function clientNamesFrom(rows: UnbilledRow[]): Map<string, string> {
  return new Map(
    rows
      .filter((r) => r.client_id)
      .map((r) => [r.client_id as string, r.client_name as string]),
  );
}

/** Project id -> its name and its client's, for the strange-duration rows. */
export function projectNamesFrom(
  rows: { id: string; name: string; client_id: string | null }[],
  clientNames: Map<string, string>,
): ProjectNames {
  return new Map(
    rows.map((p) => [
      p.id,
      {
        name: p.name,
        clientName: p.client_id ? (clientNames.get(p.client_id) ?? null) : null,
      },
    ]),
  );
}
