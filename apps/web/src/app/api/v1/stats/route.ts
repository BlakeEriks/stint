import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import {
  businessDaysInLocalMonth,
  isValidTimeZone,
  startOfLocalDayOffset,
  startOfLocalMonth,
  startOfNextLocalMonth,
} from '@stint/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Query = z.object({
  /** "This month" is a local-calendar question; the server cannot infer it. */
  tz: z.string().default('UTC'),
});

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
function buildUnprojected(rows: UnprojectedRow[]) {
  return rows.map((r) => ({
    entryId: r.id,
    taskName: r.task_name,
    startedAt: r.started_at,
    seconds: r.duration_seconds ?? 0,
  }));
}

interface UnprojectedRow {
  id: string;
  task_name: string;
  started_at: string;
  duration_seconds: number | null;
}

interface DurationRow extends UnprojectedRow {
  project_id: string | null;
}

/** Project id -> its name and its client's, for the qualifier line. */
export type ProjectNames = Map<
  string,
  { name: string; clientName: string | null }
>;

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
function buildStrangeDurations(
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

/**
 * A scalar-returning `rpc` result as a number.
 *
 * PostgREST unwraps a scalar function to the value itself, while a plain
 * `select * from fn()` — which the route tests' shim runs — yields a one-row,
 * one-column set. Both shapes reach this route, and `Number([{...}])` is
 * `NaN`, so the figure is normalised here rather than at the call site.
 *
 * Numerics arrive as strings either way.
 */
function scalar(data: unknown): number {
  const v = Array.isArray(data) ? Object.values(data[0] ?? {})[0] : data;
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** A draft left this long is usually forgotten, not deliberate. */
const STALE_DRAFT_DAYS = 7;

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
const OVERDUE_GRACE_DAYS = 7;
/** Beyond this the card stops being a prompt and becomes a list. */
const MAX_UNBILLED_ROWS = 5;

/**
 * GET /api/v1/stats
 *
 * Everything the home screen's cards need, in ONE call: the cards render
 * together and a set that pops in piecemeal reads as broken.
 *
 * Money, not hours, wherever a figure can be money — this app resolves rates
 * and owns the invoice table, so it can answer the question a contractor
 * actually asks. Unbillable work has no rate by definition and reports hours
 * alone.
 */
export const GET = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const { tz: raw } = parseQuery(req, Query);
  const tz = isValidTimeZone(raw) ? raw : 'UTC';
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

    // Unbilled work with no project cannot resolve a rate beyond the user
    // default, and usually means the timer was started in a hurry.
    /* Oldest first, because the inbox row opens the oldest one: it is the
       closest to being invoiced without a rate, and it matches the overdue
       and stale rows, which both lead with the most urgent. */
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

  /* ── unbilled ──────────────────────────────────────────────────── */
  type Row = {
    client_id: string | null;
    client_name: string | null;
    currency: string | null;
    seconds: string | number;
    amount: string | number;
    unrated_count: string | number;
    oldest_at: string;
  };
  const rows = (unbilled.data ?? []) as Row[];
  const byClient = rows.slice(0, MAX_UNBILLED_ROWS).map((r) => ({
    clientId: r.client_id,
    // Work with no client is internal; the UI must not render a blank name.
    clientName: r.client_name ?? 'No client',
    currency: r.currency ?? currency,
    seconds: Number(r.seconds),
    amount: Number(r.amount),
    unratedCount: Number(r.unrated_count),
    // The aging figure is the insight: a total is a fact, a total with
    // "oldest 22 days" is a prompt.
    oldestDays: daysSince(r.oldest_at, now),
  }));

  /* ── month to date ─────────────────────────────────────────────── */
  const monthRows = (month.data ?? []) as {
    duration_seconds: number | null;
    is_billable: boolean;
  }[];
  const monthSeconds = monthRows.reduce(
    (a, r) => a + (r.duration_seconds ?? 0),
    0,
  );
  const billableSeconds = monthRows.reduce(
    (a, r) => a + (r.is_billable ? (r.duration_seconds ?? 0) : 0),
    0,
  );

  /* ── attention rows ────────────────────────────────────────────── */
  const invoiceRows = (invoices.data ?? []) as {
    id: string;
    invoice_number: string;
    client_id: string;
    status: string;
    due_date: string | null;
    total: string | number;
    currency: string | null;
    issue_date: string;
  }[];
  // The rollup only returns clients with unbilled work, so an invoiced-and-
  // quiet client is absent from it; the UI falls back to its own client list.
  const clientNames = new Map(
    rows.filter((r) => r.client_id).map((r) => [r.client_id!, r.client_name!]),
  );

  const todayKey = localKey(now, tz);
  // The cutoff, not today: an invoice is listed once it is this far past due.
  const overdueCutoff = localKey(
    startOfLocalDayOffset(now, tz, OVERDUE_GRACE_DAYS),
    tz,
  );
  const overdueInvoices = invoiceRows
    .filter(
      (i) =>
        i.status === 'sent' && i.due_date != null && i.due_date < overdueCutoff,
    )
    .map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoice_number,
      clientId: i.client_id,
      clientName: clientNames.get(i.client_id) ?? null,
      amount: Number(i.total),
      currency: i.currency ?? currency,
      daysLate: daysBetweenKeys(i.due_date!, todayKey),
    }))
    // Most overdue first: the row most likely to be acted on.
    .sort((a, b) => b.daysLate - a.daysLate);

  const staleCutoff = localKey(
    startOfLocalDayOffset(now, tz, STALE_DRAFT_DAYS),
    tz,
  );
  const staleDrafts = invoiceRows
    .filter((i) => i.status === 'draft' && i.issue_date < staleCutoff)
    .map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoice_number,
      clientId: i.client_id,
      clientName: clientNames.get(i.client_id) ?? null,
      amount: Number(i.total),
      currency: i.currency ?? currency,
      ageDays: daysBetweenKeys(i.issue_date, todayKey),
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const unprojectedRows = (unprojected.data ?? []) as UnprojectedRow[];
  const projectNames: ProjectNames = new Map(
    (
      (projectRows.data ?? []) as {
        id: string;
        name: string;
        client_id: string | null;
      }[]
    ).map((p) => [
      p.id,
      {
        name: p.name,
        clientName: p.client_id ? (clientNames.get(p.client_id) ?? null) : null,
      },
    ]),
  );
  const strangeDurations = buildStrangeDurations(
    (durationCandidates.data ?? []) as DurationRow[],
    settings.data?.min_entry_seconds ?? null,
    settings.data?.max_entry_hours == null
      ? null
      : Number(settings.data.max_entry_hours),
    projectNames,
    new Set(unprojectedRows.map((r) => r.id)),
  );

  /* Invoiced and not yet collected. DELIBERATELY separate from `unbilled`:
     that is work not yet invoiced, this is money already asked for, and
     summing the two would double-count the same hours. */
  const awaitingPayment = invoiceRows
    .filter((i) => i.status === 'sent')
    .reduce((a, i) => a + Number(i.total), 0);

  return NextResponse.json({
    currency,
    unbilled: {
      /** Never "earned" or "revenue": work done and not yet invoiced. */
      total: rows.reduce((a, r) => a + Number(r.amount), 0),
      seconds: rows.reduce((a, r) => a + Number(r.seconds), 0),
      byClient,
      moreClients: Math.max(0, rows.length - MAX_UNBILLED_ROWS),
    },
    /** Sent, not yet paid. Never added to `unbilled.total`. */
    awaitingPayment,
    pace: buildPace({
      target: settings.data?.monthly_target,
      unit: settings.data?.monthly_target_unit,
      monthSeconds,
      monthRevenue: scalar(monthRevenue.data),
      now,
      tz,
    }),
    billableRatio: monthSeconds === 0 ? null : billableSeconds / monthSeconds,
    attention: {
      overdueInvoices,
      staleDrafts,
      unprojected: buildUnprojected(unprojectedRows),
      strangeDurations,
    },
  });
});

/**
 * Pace against the monthly target, or null when none is set — the card hides
 * entirely rather than rendering an empty bar that asks to be configured.
 */
function buildPace({
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

function localKey(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Whole days between two `YYYY-MM-DD` keys. Months are 1-based in a key. */
function daysBetweenKeys(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

function daysSince(iso: string, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000),
  );
}
