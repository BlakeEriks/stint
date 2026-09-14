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
  clientNamesFrom,
  type DurationRow,
  type InvoiceRow,
  type MonthRow,
  localDateKey,
  OVERDUE_GRACE_DAYS,
  projectNamesFrom,
  scalar,
  STALE_DRAFT_DAYS,
  startOfLocalDayOffset,
  startOfLocalMonth,
  startOfNextLocalMonth,
  type UnbilledRow,
  type UnprojectedRow,
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

  const [
    unbilled,
    monthRevenue,
    settings,
    month,
    invoices,
    unprojected,
    durationCandidates,
    projectRows,
  ] = await Promise.all([
    // The rollup resolves rates in SQL, grouped by (client, rate) — one
    // client can have work at several rates, and collapsing them to one rate
    // misstates the money. See the function's own comments.
    db.rpc('unbilled_by_client', { p_user_id: userId }),

    /* Revenue for the month, for a money target. Work DONE — invoiced at its
       resolved rate plus unbilled at the same — never money collected, and
       bucketed by the entry's own date rather than the invoice's issue date.
       The function's comments carry why. */
    db.rpc('month_revenue', {
      p_user_id: userId,
      p_from: monthStart.toISOString(),
      p_to: monthEnd.toISOString(),
    }),

    db
      .from('user_settings')
      .select(
        'monthly_target, monthly_target_unit, currency, min_entry_seconds, max_entry_hours',
      )
      .maybeSingle(),

    // Month-to-date, for Pace and the billable ratio.
    db
      .from('time_entries')
      .select('duration_seconds, is_billable')
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
  const { monthSeconds, billableSeconds } = buildMonthTotals(
    (month.data ?? []) as MonthRow[],
  );

  return NextResponse.json({
    currency,
    unbilled: buildUnbilled(unbilledRows, currency, now),
    awaitingPayment: buildAwaitingPayment(invoiceRows),
    pace: buildPace({
      target: settings.data?.monthly_target,
      unit: settings.data?.monthly_target_unit,
      monthSeconds,
      monthRevenue: scalar(monthRevenue.data),
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
