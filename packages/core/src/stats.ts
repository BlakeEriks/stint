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
export interface ClientRevenueRow {
  client_id: string | null;
  client_name: string | null;
  seconds: string | number;
  invoiced: string | number;
  unbilled: string | number;
}

/**
 * A `revenue_by_day` row, keyed by local date.
 *
 * `seconds` and `amount` do not share a filter: seconds counts all billable
 * worked time in the day, amount excludes work whose rate chain resolves to
 * null. So a day of purely unrated work carries its seconds with a null
 * amount (`00000000000019_revenue_by_day_seconds.sql`).
 */
export interface DayRow {
  day: string;
  seconds: string | number;
  amount: string | number | null;
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
 * `revenue_by_day` rows as the map `buildEarnedPace` walks.
 *
 * A `date` column reaches PostgREST as `YYYY-MM-DD` but the `pg` driver the
 * route tests run through parses it into a local `Date`, whose ISO form is the
 * previous day west of Greenwich. Taking the date parts off the local value
 * keeps both paths on the key SQL actually grouped by.
 */
export function revenueByDay(rows: DayRow[]): Map<string, number> {
  // A null amount is a day of purely unrated work: it earned nothing it can
  // name, so it contributes 0 to the money line while keeping its seconds.
  return new Map(rows.map((r) => [dayKey(r), Number(r.amount ?? 0)]));
}

/**
 * A `revenue_by_day` row's local date as the `YYYY-MM-DD` key SQL grouped by.
 *
 * A `date` column reaches PostgREST as `YYYY-MM-DD` but the `pg` driver the
 * route tests run through parses it into a local `Date`, whose ISO form is the
 * previous day west of Greenwich. Taking the date parts off the local value
 * keeps both paths on the same key.
 */
function dayKey(row: DayRow): string {
  const d = row.day as unknown;
  return d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : String(d);
}

/** One day of the week's bars: the height, and the figure at its head. */
export interface WeekDay {
  /** `YYYY-MM-DD` in the caller's zone. */
  date: string;
  /** All billable worked time, unrated work included — this is the height. */
  seconds: number;
  /** Null when the day's work resolves no rate: the bar prints no figure. */
  amount: number | null;
}

/**
 * The week's seven bars, from the same rollup the month's line is built from.
 *
 * Seven entries always, one per local date from `startKeys`, so a day with no
 * work is present at zero rather than absent — the chart holds every weekday
 * label on one baseline and cannot infer a missing column's position.
 *
 * `amount` stays null where the rollup returned null, because a day of
 * unrated work has a real height and no figure to print: substituting 0 would
 * claim the work was free (`docs/design/screens/home.html`, "The week's
 * bars").
 */
export function buildWeek(rows: DayRow[], dateKeys: string[]): WeekDay[] {
  const byDate = new Map(rows.map((r) => [dayKey(r), r]));
  return dateKeys.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      seconds: row ? Number(row.seconds) : 0,
      amount: row?.amount == null ? null : roundMoney(Number(row.amount)),
    };
  });
}

/** One band of the month's strip: a client, and the money it earned. */
export interface MonthClient {
  /** Null for internal work — a project with no client, and so no hue. */
  clientId: string | null;
  clientName: string;
  amount: number;
}

/**
 * The month's money split by client — the strip beneath the climb.
 *
 * The strip is MONEY where the week's bars are seconds: the month's subject
 * is Earned, so its split divides what was earned
 * (`docs/design/screens/home.html`, "The strip and the legend").
 *
 * Each row's two money columns are summed because the split is by client and
 * not by billing state: work already invoiced is still money the month
 * earned, and dropping it would shrink a client's band the day its invoice
 * goes out.
 *
 * Ordered by amount, descending — the same order the rollup returns and the
 * order the legend names them in, so a band and its key line up.
 */
export function buildMonthByClient(rows: ClientRevenueRow[]): MonthClient[] {
  return (
    rows
      .map((r) => ({
        clientId: r.client_id,
        // Work with no client is internal; the UI must not render a blank name.
        clientName: r.client_name ?? 'Internal',
        amount: roundMoney(Number(r.invoiced) + Number(r.unbilled)),
      }))
      /* A client whose month resolved no rate earned nothing to give a band a
       width. It keeps its seconds in the week's bars, where height is hours. */
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  );
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
 * Business days a projection refuses to extrapolate from.
 *
 * Earned-so-far divided by one elapsed day, carried across twenty-two, is one
 * day's work multiplied by the month — a figure that swings by thousands when
 * the second day is logged. Below this the month has not shown a shape yet and
 * the projection is withheld rather than guessed at.
 */
export const MIN_PACE_DAYS = 3;

/**
 * Where the month lands if it keeps earning at the rate it has so far.
 *
 * Needs no target. Earned accumulates — it climbs all month and settles — so
 * carrying its trailing rate to the last working day is arithmetic on a shape
 * the series already has (`docs/design/screens/home.html`, "What earns a
 * place"). Nothing else on the screen is monotonic enough to deserve one.
 *
 * `byDay` is money per local date. Days absent from it contributed nothing,
 * which is not the same as a gap: the cumulative line holds flat.
 *
 * `projected` is null until the month has `MIN_PACE_DAYS` of business days to
 * average, which is the same instability the goal-derived pace guarded by
 * clamping its divisor — here there is no target to fall back on, so the
 * figure is withheld instead of invented.
 */
export function buildEarnedPace({
  byDay,
  now,
  tz,
}: {
  byDay?: ReadonlyMap<string, number>;
  now: Date;
  tz: string;
}) {
  const { elapsed, total } = businessDaysInLocalMonth(now, tz);
  const series = buildEarnedSeries({ byDay, now, tz });

  // Summed from `byDay` directly rather than read off the series' last
  // non-null point. The series nulls everything past today, so reading the
  // total off it would make `earned` depend on where `now` falls — a month
  // queried after it ended would have no non-null point at all and report 0.
  const monthPrefix = `${localDateKey(now, tz).slice(0, 7)}-`;
  let earned = 0;
  for (const [key, amount] of byDay ?? []) {
    if (key.startsWith(monthPrefix)) earned += amount;
  }

  // `elapsed` counts today, so a month whose 1st is a weekend gives 0 — there
  // is no rate to carry, whatever has been earned.
  const projected =
    elapsed < MIN_PACE_DAYS || total === 0
      ? null
      : roundMoney((earned / elapsed) * total);

  return {
    earned: roundMoney(earned),
    /** Null while the month is too young to have a rate worth carrying. */
    projected,
    businessDaysElapsed: elapsed,
    businessDaysTotal: total,
    /** The solid line: cumulative earned, null past today. */
    series,
    /** The dashed segment, today to month end. Null whenever `projected` is:
     *  there is no second endpoint to draw to. */
    projection:
      projected == null
        ? null
        : {
            from: {
              date: localDateKey(now, tz),
              amount: roundMoney(earned),
            },
            to: {
              date: series.at(-1)?.date ?? localDateKey(now, tz),
              amount: projected,
            },
          },
  };
}

/**
 * The month's cumulative earned, one point per business day.
 *
 * `actual` stops at today and is null beyond it: a line drawn flat to the 31st
 * would read as a month that stopped working, not a month still in progress.
 *
 * Weekend work is not discarded — it is carried onto the next business day's
 * point, so the cumulative total always equals the month's earned. Stepping on
 * business days is the whole reason this is not a calendar series: a line that
 * advanced through the weekend would sag every Saturday and recover every
 * Monday, which is the noise the business-day rule exists to kill.
 *
 * A month ending on a Saturday or Sunday has no business day left to carry
 * that weekend onto, so the LAST point absorbs everything still unconsumed.
 * Without it, work logged on the 31st of a month ending at the weekend — Jan,
 * May and Aug 2026 all do — would vanish from the line's final point.
 */
function buildEarnedSeries({
  byDay,
  now,
  tz,
}: {
  byDay: ReadonlyMap<string, number> | undefined;
  now: Date;
  tz: string;
}) {
  const keys = businessDayKeysInLocalMonth(now, tz);
  const todayKey = localDateKey(now, tz);

  // Sorted once, then walked in step with the business days, so a weekend's
  // work lands on the next business day's point rather than vanishing.
  const days = byDay
    ? [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    : [];

  let cursor = 0;
  let running = 0;

  const lastKey = keys.at(-1);

  return keys.map((key) => {
    // On the final business day the bound is the month's end rather than the
    // day itself, so a trailing Sat/Sun lands here instead of nowhere.
    const bound = key === lastKey ? `${key.slice(0, 7)}-32` : key;
    while (
      cursor < days.length &&
      (days[cursor] as [string, number])[0] <= bound
    ) {
      running += (days[cursor] as [string, number])[1];
      cursor += 1;
    }
    return {
      date: key,
      /** Null beyond today — the month has not happened yet, and a line drawn
       *  flat to the 31st would read as a month that stopped working. */
      actual: key <= todayKey ? roundMoney(running) : null,
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
