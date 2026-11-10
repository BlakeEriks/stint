import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/select-all';
import { loadBilledSpans } from '@/lib/billed-spans';
import { deriveDraft, draftRefusals } from '@/lib/drafts';
import {
  HOME_SETTINGS_COLUMNS,
  INVOICE_COLUMNS,
  ISSUED_PERIOD_COLUMNS,
  type IssuedPeriodRow,
  PROJECT_NAME_COLUMNS,
  type ProjectNameRow,
  SCHEDULED_CLIENT_COLUMNS,
  type ScheduledClientRow,
  type InvoiceRow as StoredInvoiceRow,
  toClientOf,
  toHomeSettings,
  toInvoicePeriod,
  toIssuedPeriod,
  toScheduledClient,
  toUninvoicedEntry,
  toWeekEntry,
  UNINVOICED_ENTRY_COLUMNS,
  type UninvoicedEntryRow,
  WEEK_ENTRY_COLUMNS,
  type WeekEntryRow,
} from '@/lib/rows';
import {
  addDays,
  billingZone,
  buildAwaitingPayment,
  buildCollected,
  buildEarnedPace,
  buildOpenInvoiceCount,
  buildOverdueInvoices,
  buildOverlaps,
  buildStaleDrafts,
  buildMonthByClient,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  buildWeek,
  type ClientRevenueRow,
  clientNamesFrom,
  COLLECTED_MONTHS,
  type CollectedRow,
  type DayRow,
  dayByClient,
  daysSincePaid,
  type DurationRow,
  type InvoiceRow,
  localDateKey,
  localMonthKeys,
  OVERDUE_GRACE_DAYS,
  projectNamesFrom,
  revenueByDay,
  STALE_DRAFT_DAYS,
  startOfLocalDayOffset,
  startOfLocalMonth,
  startOfLocalMonthsBack,
  startOfLocalWeek,
  startOfNextLocalMonth,
  type UnbilledRow,
  type UnprojectedRow,
  lateEntries,
  unbilledDue,
} from '@stint/core';

/**
 * Everything the home screen's cards need, in ONE call: the cards render
 * together and a set that pops in piecemeal reads as broken.
 *
 * Derived on every request, the inbox's rows included, never cached: an
 * invoice still listed as late after its money arrived is a trust failure.
 *
 * The figures themselves are built in `@stint/core`; this loads the rows.
 */
export async function readStats(
  db: SupabaseClient,
  userId: string,
  tz: string,
  now = new Date(),
) {
  const window = windows(now, tz);
  const rows = await loadStatsRows(db, userId, tz, now, window);
  const { settings } = rows;
  const { currency } = settings;
  const invoiceRows = await priceInvoices(db, rows.invoices, tz);
  const clientOf = toClientOf(rows.projects);
  const todayKey = localDateKey(now, tz);

  /* Today's earnings come out of the month's own by-day series, which is
     already loaded and already grouped on the local date. A second query for
     one of its rows would be a second definition of the same amount. */
  const byDay = revenueByDay(rows.revenueDays);

  /* The month's earned, its cumulative line and the projection, from that one
     map. `earned` is the series' own last point rather than a separate sum,
     because the projection extrapolates that series and a figure taken from a
     second source would disagree with the line drawn under it. */
  const month = buildEarnedPace({ byDay, now, tz });

  /* The week's seven days, sliced out of the widened window by the user's own
     week start. Seven keys always, so a day with no work is a zero column and
     never a missing one. */
  const weekStartKey = localDateKey(
    startOfLocalWeek(now, tz, settings.weekStartsOn),
    tz,
  );
  const week = buildWeek(
    rows.weekDays,
    Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i)),
    dayByClient(rows.weekEntries.map(toWeekEntry), clientOf, {
      from: window.weekStart.toISOString(),
      tz,
      now,
    }),
  );

  return {
    currency,
    hasEntries: rows.hasEntries,
    unbilled: buildUnbilled(rows.unbilled, currency, now),
    /* Work done today at its resolved rate, which is what `revenue_by_day`
       already computes. Absent from the map until the day earns something. */
    earnedToday: byDay.get(todayKey) ?? 0,
    /* The week's bars: height from `seconds`, the figure at each head from
       `amount`, which is null on a day whose work resolves no rate. */
    week,
    /* The month: the hero figure, the line under it, where that line lands
       if the month keeps its pace, and who the month came from — the strip's
       bands, which the line itself cannot say. */
    month: { ...month, byClient: buildMonthByClient(rows.monthClients) },
    awaitingPayment: buildAwaitingPayment(invoiceRows),
    openInvoiceCount: buildOpenInvoiceCount(invoiceRows),
    collected: buildCollected(
      rows.collected,
      localMonthKeys(now, tz, COLLECTED_MONTHS),
      rows.lastPaidAt ? daysSincePaid(rows.lastPaidAt, now, tz) : null,
      currency,
    ),
    attention: buildAttention(rows, invoiceRows, clientOf, tz, now),
  };
}

/** The windows Home's rollups are cut at. */
function windows(now: Date, tz: string) {
  return {
    monthStart: startOfLocalMonth(now, tz),
    monthEnd: startOfNextLocalMonth(now, tz),
    /* The Collected window: whole months back from this month's start, so
       the figure covers a period the user can name. The figure sums all
       twelve; the plot draws the last six of the same series. */
    collectedStart: startOfLocalMonthsBack(now, tz, COLLECTED_MONTHS - 1),
    /* The week's rollup runs over every day a week containing today could
       hold, because which of them it actually holds depends on
       `week_starts_on` — which arrives in the same batch as this query and so
       cannot be read before it is issued. Whatever week start lands, its
       seven days sit inside the six before today and the six after; the slice
       in `readStats` picks them.

       Widened rather than serialized: settings-then-query would put a round
       trip in front of the heaviest route on the screen, to narrow a rollup
       already grouped and indexed by day. */
    weekStart: startOfLocalDayOffset(now, tz, 6),
    weekEnd: startOfLocalDayOffset(now, tz, -7),
  };
}

type StatsRows = Awaited<ReturnType<typeof loadStatsRows>>;

/** Every row Home reads, typed, with each missing result read as empty. */
async function loadStatsRows(
  db: SupabaseClient,
  userId: string,
  tz: string,
  now: Date,
  w: ReturnType<typeof windows>,
) {
  const [
    unbilled,
    revenueDays,
    monthClients,
    weekDays,
    settings,
    invoices,
    unprojected,
    durationCandidates,
    overlapCandidates,
    projects,
    collected,
    weekEntries,
    issuedPeriods,
    activeClients,
    anyEntry,
  ] = await Promise.all([
    /* `p_now` on every rollup: a running entry is measured at the same
       instant the windows are cut at. */
    db.rpc('unbilled_by_client', {
      p_user_id: userId,
      p_now: now.toISOString(),
    }),

    /* The month's money one day at a time. `month_revenue` answers the month
       as a single number, which cannot be summed into a cumulative line. */
    db.rpc('revenue_by_day', {
      p_user_id: userId,
      p_from: w.monthStart.toISOString(),
      p_to: w.monthEnd.toISOString(),
      p_tz: tz,
      p_now: now.toISOString(),
    }),

    /* The month's money per client — the strip under the climb. A rollup
       over the month rather than `resolve_entry_rate` once per client, which
       is the shape this screen exists to avoid. Its window is the month's,
       so the bands sum to the same Earned the line climbs to. */
    db.rpc('revenue_by_client', {
      p_user_id: userId,
      p_from: w.monthStart.toISOString(),
      p_to: w.monthEnd.toISOString(),
      p_now: now.toISOString(),
    }),

    /* The week's bars: the same rollup over its own window, because a week
       straddles the 1st and the month's rows stop at the boundary. Both
       columns are read here — seconds set each bar's height and the money
       rides the bar's head. */
    db.rpc('revenue_by_day', {
      p_user_id: userId,
      p_from: w.weekStart.toISOString(),
      p_to: w.weekEnd.toISOString(),
      p_tz: tz,
      p_now: now.toISOString(),
    }),

    db.from('user_settings').select(HOME_SETTINGS_COLUMNS).maybeSingle(),

    db.from('invoices').select(INVOICE_COLUMNS).in('status', ['sent', 'draft']),

    /* Unbilled work with no project cannot resolve a rate beyond the user
       default. Oldest first: the inbox opens the oldest, which is the closest
       to being invoiced without a rate. */
    selectAll<UnprojectedRow>(() =>
      db
        .from('time_entries')
        .select('id, task_name, started_at, duration_seconds')
        .is('project_id', null)
        .is('invoice_id', null)
        .eq('invoiced_elsewhere', false)
        .not('ended_at', 'is', null)
        .eq('is_billable', true)
        .order('started_at', { ascending: true }),
    ),

    /* Candidates for the strange-duration row: every stopped, uninvoiced
       entry the user has not already answered for. The thresholds live in
       settings and are fetched in the same batch, so the comparison happens
       in `buildAttention` rather than in the filter. `ended_at is not null`
       keeps a running timer out: its length is still changing. */
    selectAll<DurationRow>(() =>
      db
        .from('time_entries')
        .select('id, task_name, started_at, duration_seconds, project_id')
        .is('invoice_id', null)
        .eq('invoiced_elsewhere', false)
        .not('ended_at', 'is', null)
        .eq('duration_ok', false)
        .order('started_at', { ascending: true }),
    ),

    /* Candidates for the overlap row: the same uninvoiced, stopped set,
       whatever its length. */
    selectAll<UninvoicedEntryRow>(() =>
      db
        .from('time_entries')
        .select(UNINVOICED_ENTRY_COLUMNS)
        .is('invoice_id', null)
        .eq('invoiced_elsewhere', false)
        .not('ended_at', 'is', null),
    ),

    /* Project and client names for whichever of those rows survives the
       threshold test. Fetched flat rather than as an embedded join: the
       route tests run the real handler against real Postgres through a
       supabase-shaped shim, which passes `select()` straight into SQL and
       has no PostgREST embedding to expand. */
    db.from('projects').select(PROJECT_NAME_COLUMNS),

    db.rpc('collected_by_month', {
      p_user_id: userId,
      p_from: w.collectedStart.toISOString(),
      p_to: w.monthEnd.toISOString(),
      p_tz: tz,
    }),

    /* The week window's sessions, to stack each bar by client. In this batch
       rather than a second request from the client, so Home paints from one
       response. */
    selectAll<WeekEntryRow>(() =>
      db
        .from('time_entries')
        .select(WEEK_ENTRY_COLUMNS)
        .gte('started_at', w.weekStart.toISOString())
        .lt('started_at', w.weekEnd.toISOString()),
    ),

    /* The periods already sent, for work dated inside one that no invoice
       holds. */
    db
      .from('invoices')
      .select(ISSUED_PERIOD_COLUMNS)
      .in('status', ['sent', 'paid']),

    /* For clients ready to invoice: each one's schedule. */
    db.from('clients').select(SCHEDULED_CLIENT_COLUMNS).is('archived_at', null),

    db.from('time_entries').select('id').limit(1),
  ]);

  for (const r of [
    unbilled,
    revenueDays,
    monthClients,
    weekDays,
    settings,
    invoices,
    projects,
    collected,
    issuedPeriods,
    activeClients,
    anyEntry,
  ]) {
    if (r.error) throw r.error;
  }

  const home = toHomeSettings(settings.data);

  /* The most recent payment, for "last paid Nd ago". Its own query rather
     than the newest row of the rollup: that one is bucketed by month and
     carries no day, and the last payment can be older than the window.

     Scoped to `currency`, which is why it waits for settings rather than
     joining the batch above: the line sits beside the collected figure, and
     that figure counts only this currency. A euro paid today against a
     dollar figure would read "nothing collected this month · paid today". */
  const lastPaid = await db
    .from('invoices')
    .select('paid_at')
    .eq('status', 'paid')
    .eq('currency', home.currency)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastPaid.error) throw lastPaid.error;

  const unbilledSpans = overlapCandidates.map((r) => ({
    ...r,
    invoice_number: null,
  }));

  return {
    settings: home,
    unbilled: (unbilled.data ?? []) as UnbilledRow[],
    revenueDays: (revenueDays.data ?? []) as DayRow[],
    monthClients: (monthClients.data ?? []) as ClientRevenueRow[],
    weekDays: (weekDays.data ?? []) as DayRow[],
    invoices: (invoices.data ?? []) as StoredInvoiceRow[],
    unprojected,
    durationCandidates,
    uninvoiced: overlapCandidates,
    overlapSpans: [
      ...unbilledSpans,
      ...(await loadBilledSpans(
        db,
        unbilledSpans.filter((r) => r.is_billable),
      )),
    ],
    projects: (projects.data ?? []) as ProjectNameRow[],
    collected: (collected.data ?? []) as CollectedRow[],
    weekEntries,
    issuedPeriods: (issuedPeriods.data ?? []) as IssuedPeriodRow[],
    activeClients: (activeClients.data ?? []) as ScheduledClientRow[],
    hasEntries: (anyEntry.data ?? []).length > 0,
    lastPaidAt: (lastPaid.data?.paid_at as string | undefined) ?? null,
  };
}

// A draft's total is the work it holds, priced now.
function priceInvoices(
  db: SupabaseClient,
  stored: StoredInvoiceRow[],
  tz: string,
): Promise<InvoiceRow[]> {
  return Promise.all(
    stored.map(async (row) => {
      const draft = await deriveDraft(db, row, tz);
      const r = draft?.row ?? row;
      return {
        ...r,
        total: r.total ?? 0,
        refuses: draft ? draftRefusals(draft) : undefined,
        entry_count: draft?.computed.totals.entryCount,
      };
    }),
  );
}

/** The inbox's rows: each record Home asks the user to resolve. */
function buildAttention(
  rows: StatsRows,
  invoiceRows: InvoiceRow[],
  clientOf: Map<string, string | null>,
  tz: string,
  now: Date,
) {
  const { settings } = rows;
  const { currency } = settings;
  const clientNames = clientNamesFrom(rows.unbilled);
  const todayKey = localDateKey(now, tz);
  const billTz = billingZone(settings, tz);
  const uninvoiced = rows.uninvoiced.map((r) => toUninvoicedEntry(r, clientOf));
  const issued = rows.issuedPeriods.map(toIssuedPeriod);

  return {
    noDefaultRate: settings.defaultHourlyRate == null,
    paymentTermsToCheck: settings.legacyPaymentTerms,
    overdueInvoices: buildOverdueInvoices(
      invoiceRows,
      clientNames,
      currency,
      todayKey,
      // The cutoff, not today: an invoice is listed once it is this far
      // past due.
      localDateKey(startOfLocalDayOffset(now, tz, OVERDUE_GRACE_DAYS), tz),
    ),
    staleDrafts: buildStaleDrafts(
      invoiceRows,
      clientNames,
      currency,
      todayKey,
      localDateKey(startOfLocalDayOffset(now, tz, STALE_DRAFT_DAYS), tz),
    ),
    lateEntries: lateEntries(uninvoiced, issued, tz).map((e) => ({
      ...e,
      clientName: clientNames.get(e.clientId) ?? null,
    })),
    unbilledDue: unbilledDue(
      {
        clients: rows.activeClients.map(toScheduledClient),
        entries: uninvoiced,
        invoices: [...rows.invoices.map(toInvoicePeriod), ...issued],
      },
      // Read as its invoice will be, so no entry is both due and late.
      localDateKey(now, billTz),
      billTz,
    ),
    unprojected: buildUnprojected(rows.unprojected),
    strangeDurations: buildStrangeDurations(
      rows.durationCandidates,
      settings.minEntrySeconds,
      settings.maxEntryHours,
      projectNamesFrom(rows.projects, clientNames),
      new Set(rows.unprojected.map((r) => r.id)),
    ),
    overlaps: buildOverlaps(rows.overlapSpans),
  };
}
