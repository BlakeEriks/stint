import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import {
  buildAwaitingPayment,
  buildBillableRatio,
  buildMonthTotals,
  buildOverdueInvoices,
  buildPace,
  buildStaleDrafts,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  buildVelocity,
  buildHoursByDay,
  clientNamesFrom,
  type DayRow,
  type DurationRow,
  type InvoiceRow,
  type MonthRow,
  localDateKey,
  OVERDUE_GRACE_DAYS,
  projectNamesFrom,
  revenueByDay,
  scalar,
  STALE_DRAFT_DAYS,
  startOfLocalDayOffset,
  startOfLocalMonth,
  startOfNextLocalMonth,
  type UnbilledRow,
  type UnprojectedRow,
  type VelocityRow,
  VELOCITY_MONTHS,
} from '@stint/core';
import { StatsQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/stats
 *
 * Everything the home screen's cards need, in ONE call: the cards render
 * together and a set that pops in piecemeal reads as broken.
 *
 * The figures themselves are built in `@stint/core`; this loads the rows.
 */
export const GET = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const { tz } = parseQuery(req, StatsQuery);
  const now = new Date();

  const monthStart = startOfLocalMonth(now, tz);
  const monthEnd = startOfNextLocalMonth(now, tz);

  /* Walked back a month at a time from this month's start rather than by a
     fixed number of days: months are 28-31 days long, so subtracting 90 would
     land mid-month and the window would stop being a period with a name.

     Each step lands well inside the previous month rather than one second
     before the boundary, so a DST shift cannot put it back on the 1st and
     stall the walk. */
  let velocityStart = monthStart;
  for (let i = 1; i < VELOCITY_MONTHS; i += 1) {
    velocityStart = startOfLocalMonth(
      new Date(velocityStart.getTime() - 12 * 3_600_000),
      tz,
    );
  }

  const [
    unbilled,
    monthRevenue,
    velocity,
    revenueDays,
    settings,
    month,
    invoices,
    unprojected,
    durationCandidates,
    projectRows,
  ] = await Promise.all([
    db.rpc('unbilled_by_client', { p_user_id: userId }),

    db.rpc('month_revenue', {
      p_user_id: userId,
      p_from: monthStart.toISOString(),
      p_to: monthEnd.toISOString(),
    }),

    db.rpc('revenue_by_client', {
      p_user_id: userId,
      p_from: velocityStart.toISOString(),
      p_to: monthEnd.toISOString(),
    }),

    /* The month's money one day at a time. `month_revenue` answers the month
       as a single number, which cannot be summed into a cumulative line. */
    db.rpc('revenue_by_day', {
      p_user_id: userId,
      p_from: monthStart.toISOString(),
      p_to: monthEnd.toISOString(),
      p_tz: tz,
    }),

    db
      .from('user_settings')
      .select(
        'monthly_target, monthly_target_unit, currency, min_entry_seconds, max_entry_hours',
      )
      .maybeSingle(),

    // Month-to-date, for Pace and the billable ratio. `started_at` buckets an
    // hours target's cumulative line by local day.
    db
      .from('time_entries')
      .select('duration_seconds, is_billable, started_at')
      .gte('started_at', monthStart.toISOString())
      .lt('started_at', monthEnd.toISOString())
      .not('ended_at', 'is', null),

    db
      .from('invoices')
      .select(
        'id, invoice_number, client_id, status, due_date, total, currency, issue_date',
      )
      .in('status', ['sent', 'draft']),

    /* Unbilled work with no project cannot resolve a rate beyond the user
       default. Oldest first: the inbox opens the oldest, which is the closest
       to being invoiced without a rate. */
    db
      .from('time_entries')
      .select('id, task_name, started_at, duration_seconds')
      .is('project_id', null)
      .is('invoice_id', null)
      .not('ended_at', 'is', null)
      .eq('is_billable', true)
      .order('started_at', { ascending: true }),

    /* Candidates for the strange-duration row: every stopped, uninvoiced
         entry the user has not already answered for. The thresholds live in
         settings and are fetched in the same batch, so the comparison happens
         below rather than in the filter. `ended_at is not null` is also what
         keeps a running timer out of this row — that is the runaway row's
         subject, and never both. */
    db
      .from('time_entries')
      .select('id, task_name, started_at, duration_seconds, project_id')
      .is('invoice_id', null)
      .not('ended_at', 'is', null)
      .eq('duration_ok', false)
      .order('started_at', { ascending: true }),

    /* Project and client names for whichever of those rows survives the
         threshold test. Fetched flat rather than as an embedded join: the
         route tests run the real handler against real Postgres through a
         supabase-shaped shim, which passes `select()` straight into SQL and
         has no PostgREST embedding to expand. */
    db.from('projects').select('id, name, client_id'),
  ]);

  for (const r of [
    unbilled,
    monthRevenue,
    velocity,
    revenueDays,
    settings,
    month,
    invoices,
    unprojected,
    durationCandidates,
    projectRows,
  ]) {
    if (r.error) throw r.error;
  }

  const currency = settings.data?.currency ?? 'USD';
  const unbilledRows = (unbilled.data ?? []) as UnbilledRow[];
  const invoiceRows = (invoices.data ?? []) as InvoiceRow[];
  const unprojectedRows = (unprojected.data ?? []) as UnprojectedRow[];
  const clientNames = clientNamesFrom(unbilledRows);

  const todayKey = localDateKey(now, tz);
  const monthRows = (month.data ?? []) as MonthRow[];
  const { monthSeconds, billableSeconds } = buildMonthTotals(monthRows);

  const unit = settings.data?.monthly_target_unit;

  return NextResponse.json({
    currency,
    unbilled: buildUnbilled(unbilledRows, currency, now),
    velocity: buildVelocity(
      (velocity.data ?? []) as VelocityRow[],
      currency,
      VELOCITY_MONTHS,
    ),
    awaitingPayment: buildAwaitingPayment(invoiceRows),
    pace: buildPace({
      target: settings.data?.monthly_target,
      unit,
      monthSeconds,
      monthRevenue: scalar(monthRevenue.data),
      // The cumulative line is in the target's own unit, so only that unit's
      // series is built — the other would be a second shape nothing reads.
      byDay:
        unit === 'revenue'
          ? revenueByDay((revenueDays.data ?? []) as DayRow[])
          : buildHoursByDay(monthRows, tz),
      now,
      tz,
    }),
    billableRatio: buildBillableRatio(monthSeconds, billableSeconds),
    attention: {
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
      unprojected: buildUnprojected(unprojectedRows),
      strangeDurations: buildStrangeDurations(
        (durationCandidates.data ?? []) as DurationRow[],
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
        new Set(unprojectedRows.map((r) => r.id)),
      ),
    },
  });
});
