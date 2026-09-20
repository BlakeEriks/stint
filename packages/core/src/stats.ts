/**
 * The home screen's figures, built from loaded rows.
 *
 * Pure: the route parses the query, loads, and hands the rows here. Money
 * wherever a figure can be money; unbillable work has no rate by definition
 * and reports hours alone.
 */

import { businessDaysInLocalMonth, localDateKey } from './calendar.ts';

/** A draft left this long is usually forgotten, not deliberate. */
export const STALE_DRAFT_DAYS = 7;

/**
 * Days past the due date before an invoice is "overdue" here.
 *
 * Firing the moment `due_date` passes is noise — Net 30 with a client who
 * pays on day 32 is ordinary — and a card that flags it trains the user to
 * clear the list without reading it. The invoice detail page still shows the
 * true due date; this only governs when the card speaks up.
 */
export const OVERDUE_GRACE_DAYS = 7;

/** Beyond this the card stops being a prompt and becomes a list. */
export const MAX_UNBILLED_ROWS = 5;

/**
 * Columns the by-project chart draws before the rest becomes a footer line.
 *
 * Its own constant rather than `MAX_UNBILLED_ROWS`: that one bounds a list of
 * rows, this one bounds bars competing for a fixed plot width, and sharing it
 * would let a change made for one reshape the other.
 */
export const MAX_PROJECT_COLUMNS = 4;

/**
 * Months of trailing work the Velocity figure covers.
 *
 * Whole months including the current one, so the window is a period the user
 * can name. A trailing 90 days would cut a month in half and make the figure
 * disagree with anything they compare it against.
 */
export const VELOCITY_MONTHS = 3;

/**
 * Months of payments the Collected figure sums.
 *
 * A calendar month reads `0` for most of every month when a contractor is
 * paid monthly, and walks backwards on the 1st. A trailing year does neither,
 * and only stops rising when a month rolls off the far end.
 */
export const COLLECTED_MONTHS = 12;

/**
 * Months the Collected plot draws.
 *
 * Fewer than the figure sums, because the two answer different questions: the
 * figure accumulates, the plot shows recent shape. At twelve points one month
 * is an illegible share of the panel's width, and eleven months back is not a
 * horizon anyone acts on.
 */
export const COLLECTED_PLOT_MONTHS = 6;

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

/** A `revenue_by_client` row. Numerics arrive from PostgREST as strings. */
export interface VelocityRow {
  client_id: string | null;
  client_name: string | null;
  currency: string | null;
  seconds: string | number;
  invoiced: string | number;
  unbilled: string | number;
  unrated_count: string | number;
}

/**
 * A `revenue_by_project` row. Numerics arrive from PostgREST as strings.
 *
 * `project_id` and `project_name` are both null on the single row that
 * carries work filed under no project.
 */
export interface ByProjectRow {
  project_id: string | null;
  project_name: string | null;
  client_id: string | null;
  client_name: string | null;
  currency: string | null;
  seconds: string | number;
  billable_seconds: string | number;
  invoiced: string | number;
  unbilled: string | number;
  unrated_count: string | number;
}

/** A `revenue_by_day` row, keyed by local date. */
export interface DayRow {
  day: string;
  amount: string | number;
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
  started_at: string;
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
 * Whole CALENDAR days since a payment, in the user's zone.
 *
 * Not elapsed 24-hour spans, which is what `daysSince` measures: a payment
 * that cleared at 23:00 last night is ten hours old at 09:00, so it floors to
 * 0 and the screen says "paid today" about yesterday's money. The screen's
 * word is a calendar word, so the arithmetic has to be one too — the same
 * local-date keys the rest of the stats route buckets on.
 *
 * Null when `paid_at` is in the future, on the same footing as never having
 * been paid: the line is omitted rather than made to read "paid today" about
 * a payment that has not happened. Clamping is what would invent that claim.
 */
export function daysSincePaid(
  iso: string,
  now: Date,
  tz: string,
): number | null {
  const days = daysBetweenKeys(
    localDateKey(new Date(iso), tz),
    localDateKey(now, tz),
  );
  return days < 0 ? null : days;
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
 * Trailing-window gross, split invoiced vs not yet invoiced, per client.
 *
 * Gross work DONE over the window, on the same terms as `month_revenue`: a
 * client paying late says nothing about the quarter you worked. The split is
 * where the work stands now, so it moves as invoices are raised while the
 * total does not.
 *
 * DELIBERATELY not comparable with `awaitingPayment`, which is money already
 * asked for across every period, not this window's.
 *
 * Each row is already rounded once per (client, rate, invoiced) bucket in SQL,
 * so the totals round once more — adding rounded lines lands fractions of a
 * cent below the last place and the response would not be `money`.
 */
export function buildVelocity(
  rows: VelocityRow[],
  fallbackCurrency: string,
  months: number,
) {
  const invoiced = roundMoney(rows.reduce((a, r) => a + Number(r.invoiced), 0));
  const unbilled = roundMoney(rows.reduce((a, r) => a + Number(r.unbilled), 0));
  const total = roundMoney(invoiced + unbilled);
  return {
    months,
    total,
    /* Rounded here, not at the render: `Intl` rounds an unrounded quotient to
       two places for display, so the headline the user reads multiplied by
       `months` did not equal the split printed beneath it. The client does
       not compute money. */
    perMonth: roundMoney(total / months),
    invoiced,
    unbilled,
    seconds: rows.reduce((a, r) => a + Number(r.seconds), 0),
    byClient: rows.slice(0, MAX_UNBILLED_ROWS).map((r) => ({
      clientId: r.client_id,
      // Work with no client is internal; the UI must not render a blank name.
      clientName: r.client_name ?? 'No client',
      currency: r.currency ?? fallbackCurrency,
      seconds: Number(r.seconds),
      invoiced: Number(r.invoiced),
      unbilled: Number(r.unbilled),
      unratedCount: Number(r.unrated_count),
    })),
    moreClients: Math.max(0, rows.length - MAX_UNBILLED_ROWS),
  };
}

/**
 * The same trailing window as Velocity, ranked by project instead of client.
 *
 * `seconds` counts all worked time and `amount` counts billable work alone,
 * so a project that is entirely unbillable has hours and no money — which is
 * what it is, not a gap.
 *
 * Work filed under no project is partitioned out before the slice and can
 * never become a column, however many hours it carries: a bar for work that
 * is not a project would take one of four slots from work that is, and the
 * unprojected card already owns that subject and links to the fix. It still
 * lands in the tail and the section totals, so `columns + tail === total`
 * holds and the footer states the window's real total. A chart whose total
 * omits unfiled hours is a billing screen disagreeing with itself.
 *
 * One array, ordered by seconds as SQL ordered it. Revenue mode ranks
 * differently, but that is a re-sort of the same four rows, not a second cut.
 */
export function buildByProject(rows: ByProjectRow[], fallbackCurrency: string) {
  const amountOf = (r: ByProjectRow) => Number(r.invoiced) + Number(r.unbilled);
  const projects = rows.filter((r) => r.project_id !== null);
  const columns = projects.slice(0, MAX_PROJECT_COLUMNS);
  const tail = [
    ...projects.slice(MAX_PROJECT_COLUMNS),
    ...rows.filter((r) => r.project_id === null),
  ];
  return {
    seconds: rows.reduce((a, r) => a + Number(r.seconds), 0),
    /* Rounded once on the sum, like every other total here: each row was
       already rounded per bucket in SQL, and adding rounded lines lands
       fractions of a cent below the last place. */
    amount: roundMoney(rows.reduce((a, r) => a + amountOf(r), 0)),
    byProject: columns.map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      /** Null for internal work — a project with no client. */
      clientId: r.client_id,
      clientName: r.client_name,
      currency: r.currency ?? fallbackCurrency,
      seconds: Number(r.seconds),
      billableSeconds: Number(r.billable_seconds),
      amount: amountOf(r),
      unratedCount: Number(r.unrated_count),
    })),
    /* The footer prints the remainder as a figure, not just a count, so it
       carries its own totals rather than leaving the reader to subtract. */
    moreProjects: tail.length,
    tailSeconds: tail.reduce((a, r) => a + Number(r.seconds), 0),
    tailAmount: roundMoney(tail.reduce((a, r) => a + amountOf(r), 0)),
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

/** How many invoices make up `awaitingPayment`. */
export function buildOpenInvoiceCount(invoices: InvoiceRow[]): number {
  return invoices.filter((i) => i.status === 'sent').length;
}

/**
 * A `collected_by_month` row. Numerics arrive from PostgREST as strings.
 *
 * A month appears once per currency the user was paid in, because money is
 * not addable across them.
 */
export interface CollectedRow {
  month: string;
  currency: string | null;
  amount: string | number;
}

/**
 * Money that arrived, from payments bucketed by `paid_at`.
 *
 * The only finished figure on the screen. `unbilled` can still be discounted
 * or written off and `awaitingPayment` can still go unpaid, so neither is
 * ever summed with this — they are three stages of one pipeline.
 *
 * The rollup returns only months that HAVE payments. The series is built from
 * the window instead, so a month nobody paid in is a real zero rather than a
 * hole in the line.
 *
 * Only rows in `currency` count. The response carries ONE currency and the
 * screen prints it beside the figure, so a payment in another one added in
 * would be a euro reported as a dollar — the silent misreporting this app
 * exists not to do. A month can hold both, so the rows are summed per month
 * after the filter rather than assumed unique.
 */
export function buildCollected(
  rows: CollectedRow[],
  months: string[],
  daysSincePaid: number | null,
  currency: string,
) {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (r.currency !== currency) continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + Number(r.amount));
  }
  const plot = months.slice(-COLLECTED_PLOT_MONTHS);
  const thisMonth = months[months.length - 1];

  return {
    /* Summed over the window rather than over the rows: a row outside it
       would otherwise inflate the figure the screen leads with. */
    trailing12: roundMoney(
      months.reduce((a, m) => a + (byMonth.get(m) ?? 0), 0),
    ),
    thisMonth: roundMoney(thisMonth ? (byMonth.get(thisMonth) ?? 0) : 0),
    daysSincePaid,
    byMonth: plot.map((m) => ({
      month: m,
      amount: roundMoney(byMonth.get(m) ?? 0),
    })),
  };
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

/**
 * Month-to-date hours per local calendar day, for the cumulative line.
 *
 * Bucketed by the entry's own `started_at` in the user's zone, matching how
 * `revenue_by_day` keys the money — the two series have to agree on where a
 * day begins or the hours and revenue months would disagree about the same
 * evening's work.
 */
export function buildHoursByDay(
  rows: MonthRow[],
  tz: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = localDateKey(new Date(r.started_at), tz);
    out.set(key, (out.get(key) ?? 0) + (r.duration_seconds ?? 0) / 3600);
  }
  return out;
}

/**
 * `revenue_by_day` rows as the map `buildPace` walks.
 *
 * A `date` column reaches PostgREST as `YYYY-MM-DD` but the `pg` driver the
 * route tests run through parses it into a local `Date`, whose ISO form is the
 * previous day west of Greenwich. Taking the date parts off the local value
 * keeps both paths on the key SQL actually grouped by.
 */
export function revenueByDay(rows: DayRow[]): Map<string, number> {
  return new Map(
    rows.map((r) => {
      const d = r.day as unknown;
      const key =
        d instanceof Date
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          : String(d);
      return [key, Number(r.amount)];
    }),
  );
}

/** Null when nothing was tracked this month — 0/0 is not 0%. */
export function buildBillableRatio(
  monthSeconds: number,
  billableSeconds: number,
): number | null {
  return monthSeconds === 0 ? null : billableSeconds / monthSeconds;
}

/**
 * The local month's business days, in order, as `YYYY-MM-DD` keys.
 *
 * The ray steps on these and no others. A ray that advanced on calendar days
 * would slope through the weekend, showing the user falling behind every
 * Saturday and recovering every Monday — exactly the noise the business-day
 * rule exists to kill.
 *
 * Must select the same days as `businessDaysInLocalMonth`'s `total`, which
 * counts what this lists: the card reads `series.length` against that figure,
 * so the two loops diverging would misreport the month's length.
 */
export function businessDayKeysInLocalMonth(now: Date, tz: string): string[] {
  const [y, m] = localDateKey(now, tz).split('-').map(Number) as [
    number,
    number,
  ];
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const keys: string[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    // getUTCDay on a UTC-midnight date gives that calendar date's weekday.
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    keys.push(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }
  return keys;
}

/**
 * Pace against the monthly target, or null when none is set — the card hides
 * entirely rather than rendering an empty bar that asks to be configured.
 *
 * `byDay` is that unit's own per-day figure — hours for an hours target, money
 * for a revenue one — keyed by local date. Days absent from it contributed
 * nothing, which is not the same as a gap: the cumulative line holds flat.
 *
 * A revenue target reports `expected` and `delta` on the same terms as an
 * hours one. A bare "behind by $2,400" on the 3rd is arithmetic rather than a
 * finding; read against the cumulative line, the same projection is a shape,
 * which is what makes it worth stating.
 */
export function buildPace({
  target,
  unit,
  monthSeconds,
  monthRevenue,
  byDay,
  now,
  tz,
}: {
  target: string | number | null | undefined;
  unit: string | null | undefined;
  monthSeconds: number;
  monthRevenue: number;
  byDay?: ReadonlyMap<string, number>;
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

  return {
    unit,
    target: goal,
    actual,
    expected,
    /** Positive is ahead. Spelled out, not left to a bar to imply. */
    delta: actual - expected,
    businessDaysElapsed: elapsed,
    businessDaysTotal: total,
    series: buildPaceSeries({ goal, byDay, total, now, tz }),
  };
}

/**
 * The month's cumulative line against its goal ray, one point per business day.
 *
 * `actual` stops at today and is null beyond it: a line drawn flat to the 31st
 * would read as a month that stopped working, not a month still in progress.
 * The ray runs the full month, because where the target lands is the point of
 * drawing it.
 *
 * Weekend work is not discarded — it is carried onto the next business day's
 * point, so the cumulative total always equals the month's actual.
 */
function buildPaceSeries({
  goal,
  byDay,
  total,
  now,
  tz,
}: {
  goal: number;
  byDay: ReadonlyMap<string, number> | undefined;
  total: number;
  now: Date;
  tz: string;
}) {
  const keys = businessDayKeysInLocalMonth(now, tz);
  const todayKey = localDateKey(now, tz);
  const step = total === 0 ? 0 : goal / total;

  // Sorted once, then walked in step with the business days, so a weekend's
  // work lands on the next business day's point rather than vanishing.
  const days = byDay
    ? [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    : [];

  let cursor = 0;
  let running = 0;

  return keys.map((key, i) => {
    while (
      cursor < days.length &&
      (days[cursor] as [string, number])[0] <= key
    ) {
      running += (days[cursor] as [string, number])[1];
      cursor += 1;
    }
    return {
      date: key,
      /** Null beyond today — the month has not happened yet, and a line drawn
       *  flat to the 31st would read as a month that stopped working. */
      actual: key <= todayKey ? running : null,
      /** The ray steps once per business day, never through the weekend. */
      expected: step * (i + 1),
    };
  });
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
