import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/select-all';
import { loadBilledSpans } from '@/lib/billed-spans';
import { deriveDraft, draftBlocked } from '@/lib/invoicing';
import {
  INVOICE_COLUMNS,
  type InvoiceRow as StoredInvoiceRow,
} from '@/lib/rows';
import {
  addDays,
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
  type SpanRow,
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
/** A session as the week's per-client stack reads it. */
interface WeekEntryRow {
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  project_id: string | null;
  is_billable: boolean;
}

export async function readStats(
  db: SupabaseClient,
  userId: string,
  tz: string,
) {
  const now = new Date();

  const monthStart = startOfLocalMonth(now, tz);
  const monthEnd = startOfNextLocalMonth(now, tz);

  /* The Collected window: whole months back from this month's start, so the
     figure covers a period the user can name. The figure sums all twelve; the
     plot draws the last six of the same series. */
  const collectedStart = startOfLocalMonthsBack(now, tz, COLLECTED_MONTHS - 1);
  const collectedMonths = localMonthKeys(now, tz, COLLECTED_MONTHS);

  /* The week's rollup runs over every day a week containing today could hold,
     because which of them it actually holds depends on `week_starts_on` —
     which arrives in the same batch as this query and so cannot be read
     before it is issued. Whatever week start lands, its seven days sit inside
     the six before today and the six after; the slice below picks them.

     Widened rather than serialized: settings-then-query would put a round
     trip in front of the heaviest route on the screen, to narrow a rollup
     already grouped and indexed by day. */
  const weekWindowStart = startOfLocalDayOffset(now, tz, 6);
  const weekWindowEnd = startOfLocalDayOffset(now, tz, -7);

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
    projectRows,
    collectedRows,
    weekEntries,
    issuedPeriods,
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
      p_from: monthStart.toISOString(),
      p_to: monthEnd.toISOString(),
      p_tz: tz,
      p_now: now.toISOString(),
    }),

    /* The month's money per client — the strip under the climb. A rollup
       over the month rather than `resolve_entry_rate` once per client, which
       is the shape this screen exists to avoid. Its window is the month's,
       so the bands sum to the same Earned the line climbs to. */
    db.rpc('revenue_by_client', {
      p_user_id: userId,
      p_from: monthStart.toISOString(),
      p_to: monthEnd.toISOString(),
      p_now: now.toISOString(),
    }),

    /* The week's bars: the same rollup over its own window, because a week
       straddles the 1st and the month's rows stop at the boundary. Both
       columns are read here — seconds set each bar's height and the money
       rides the bar's head. */
    db.rpc('revenue_by_day', {
      p_user_id: userId,
      p_from: weekWindowStart.toISOString(),
      p_to: weekWindowEnd.toISOString(),
      p_tz: tz,
      p_now: now.toISOString(),
    }),

    db
      .from('user_settings')
      .select(
        'currency, min_entry_seconds, max_entry_hours, week_starts_on, default_hourly_rate, legacy_payment_terms',
      )
      .maybeSingle(),

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
         below rather than in the filter. `ended_at is not null` keeps a
         running timer out: its length is still changing. */
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
    selectAll<
      Omit<SpanRow, 'invoice_number'> & {
        project_id: string | null;
        duration_seconds: number;
      }
    >(() =>
      db
        .from('time_entries')
        .select(
          'id, task_name, started_at, ended_at, duration_seconds, is_billable, project_id',
        )
        .is('invoice_id', null)
        .eq('invoiced_elsewhere', false)
        .not('ended_at', 'is', null),
    ),

    /* Project and client names for whichever of those rows survives the
         threshold test. Fetched flat rather than as an embedded join: the
         route tests run the real handler against real Postgres through a
         supabase-shaped shim, which passes `select()` straight into SQL and
         has no PostgREST embedding to expand. */
    db.from('projects').select('id, name, client_id'),

    db.rpc('collected_by_month', {
      p_user_id: userId,
      p_from: collectedStart.toISOString(),
      p_to: monthEnd.toISOString(),
      p_tz: tz,
    }),

    /* The week window's sessions, to stack each bar by client. In this batch
       rather than a second request from the client, so Home paints from one
       response. */
    selectAll<WeekEntryRow>(() =>
      db
        .from('time_entries')
        .select(
          'started_at, ended_at, duration_seconds, project_id, is_billable',
        )
        .gte('started_at', weekWindowStart.toISOString())
        .lt('started_at', weekWindowEnd.toISOString()),
    ),

    /* The periods already sent, for work dated inside one that no invoice
       holds. */
    db
      .from('invoices')
      .select('id, invoice_number, client_id, period_start, period_end')
      .in('status', ['sent', 'paid']),
  ]);

  for (const r of [
    unbilled,
    revenueDays,
    monthClients,
    weekDays,
    settings,
    invoices,
    projectRows,
    collectedRows,
    issuedPeriods,
  ]) {
    if (r.error) throw r.error;
  }

  const currency = settings.data?.currency ?? 'USD';

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
    .eq('currency', currency)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastPaid.error) throw lastPaid.error;

  const unbilledSpans = overlapCandidates.map((r) => ({
    ...r,
    invoice_number: null,
  }));
  const overlapSpans = [
    ...unbilledSpans,
    ...(await loadBilledSpans(
      db,
      unbilledSpans.filter((r) => r.is_billable),
    )),
  ];

  const unbilledRows = (unbilled.data ?? []) as UnbilledRow[];
  // A draft's total is its period's work now.
  const invoiceRows: InvoiceRow[] = await Promise.all(
    ((invoices.data ?? []) as StoredInvoiceRow[]).map(async (stored) => {
      const draft = await deriveDraft(db, stored, tz);
      const r = draft?.row ?? stored;
      return {
        ...r,
        total: r.total ?? 0,
        blocked: draft ? draftBlocked(draft) : false,
      };
    }),
  );
  const clientNames = clientNamesFrom(unbilledRows);

  const todayKey = localDateKey(now, tz);

  /* Today's earnings come out of the month's own by-day series, which is
     already loaded and already grouped on the local date. A second query for
     one of its rows would be a second definition of the same amount. */
  const byDay = revenueByDay((revenueDays.data ?? []) as DayRow[]);

  /* The month's earned, its cumulative line and the projection, from that one
     map. `earned` is the series' own last point rather than a separate sum,
     because the projection extrapolates that series and a figure taken from a
     second source would disagree with the line drawn under it. */
  const month = buildEarnedPace({ byDay, now, tz });

  /* The week's seven days, sliced out of the widened window by the user's own
     week start. Seven keys always, so a day with no work is a zero column and
     never a missing one. */
  const weekStartKey = localDateKey(
    startOfLocalWeek(now, tz, settings.data?.week_starts_on ?? 1),
    tz,
  );
  const clientOf = new Map(
    (projectRows.data ?? []).map((p) => [
      p.id as string,
      (p.client_id as string | null) ?? null,
    ]),
  );
  const week = buildWeek(
    (weekDays.data ?? []) as DayRow[],
    Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i)),
    dayByClient(
      weekEntries.map((e) => ({
        startedAt: e.started_at,
        endedAt: e.ended_at,
        durationSeconds: e.duration_seconds,
        projectId: e.project_id,
        isBillable: e.is_billable,
      })),
      clientOf,
      { from: weekWindowStart.toISOString(), tz, now },
    ),
  );

  return {
    currency,
    unbilled: buildUnbilled(unbilledRows, currency, now),
    /* Work done today at its resolved rate, which is what `revenue_by_day`
       already computes. Absent from the map until the day earns something. */
    earnedToday: byDay.get(todayKey) ?? 0,
    /* The week's bars: height from `seconds`, the figure at each head from
       `amount`, which is null on a day whose work resolves no rate. */
    week,
    /* The month: the hero figure, the line under it, where that line lands
       if the month keeps its pace, and who the month came from — the strip's
       bands, which the line itself cannot say. */
    month: {
      ...month,
      byClient: buildMonthByClient(
        (monthClients.data ?? []) as ClientRevenueRow[],
      ),
    },
    awaitingPayment: buildAwaitingPayment(invoiceRows),
    openInvoiceCount: buildOpenInvoiceCount(invoiceRows),
    collected: buildCollected(
      (collectedRows.data ?? []) as CollectedRow[],
      collectedMonths,
      lastPaid.data?.paid_at
        ? daysSincePaid(lastPaid.data.paid_at, now, tz)
        : null,
      currency,
    ),
    attention: {
      noDefaultRate: settings.data?.default_hourly_rate == null,
      paymentTermsToCheck: settings.data?.legacy_payment_terms ?? null,
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
      lateEntries: lateEntries(
        overlapCandidates.map((r) => ({
          id: r.id,
          taskName: r.task_name,
          startedAt: new Date(r.started_at).toISOString(),
          durationSeconds: r.duration_seconds,
          isBillable: r.is_billable,
          clientId: r.project_id ? (clientOf.get(r.project_id) ?? null) : null,
        })),
        (issuedPeriods.data ?? []).map((i) => ({
          id: i.id as string,
          invoiceNumber: i.invoice_number as string,
          clientId: i.client_id as string,
          periodStart: i.period_start as string,
          periodEnd: i.period_end as string,
        })),
        tz,
      ).map((e) => ({ ...e, clientName: clientNames.get(e.clientId) ?? null })),
      unprojected: buildUnprojected(unprojected),
      strangeDurations: buildStrangeDurations(
        durationCandidates,
        settings.data?.min_entry_seconds ?? null,
        settings.data?.max_entry_hours == null
          ? null
          : Number(settings.data.max_entry_hours),
        projectNamesFrom(
          (projectRows.data ?? []) as {
            id: string;
            name: string;
            client_id: string | null;
          }[],
          clientNames,
        ),
        new Set(unprojected.map((r) => r.id)),
      ),
      overlaps: buildOverlaps(overlapSpans),
    },
  };
}
