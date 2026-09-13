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
 * The unprojected row, or `null` when there is nothing to report.
 *
 * `null` rather than a zero row, so the UI renders nothing at all — a row
 * reading "0 entries, no project" is an inbox item reporting that there is
 * nothing to report.
 *
 * `oldestId` is what lets the row open the editor on something: it is a queue
 * of decisions rather than a link to a record, and there is no entries page
 * for it to lead to. Oldest, because that entry is closest to being invoiced
 * without a rate.
 */
function buildUnprojected(
  rows: { id: string; duration_seconds: number | null }[],
) {
  const [oldest] = rows;
  if (!oldest) return null;
  return {
    count: rows.length,
    seconds: rows.reduce((a, r) => a + (r.duration_seconds ?? 0), 0),
    oldestId: oldest.id,
  };
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

  const [unbilled, settings, month, invoices, unprojected] = await Promise.all([
    // The rollup resolves rates in SQL, grouped by (client, rate) — one
    // client can have work at several rates, and collapsing them to one rate
    // misstates the money. See the function's own comments.
    db.rpc('unbilled_by_client', { p_user_id: userId }),

    db
      .from('user_settings')
      .select('monthly_target, monthly_target_unit, currency')
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
      .select('id, duration_seconds')
      .is('project_id', null)
      .is('invoice_id', null)
      .not('ended_at', 'is', null)
      .eq('is_billable', true)
      .order('started_at', { ascending: true }),
  ]);

  for (const r of [unbilled, settings, month, invoices, unprojected]) {
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

  const unprojectedRows = (unprojected.data ?? []) as {
    id: string;
    duration_seconds: number | null;
  }[];

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
      now,
      tz,
    }),
    billableRatio: monthSeconds === 0 ? null : billableSeconds / monthSeconds,
    attention: {
      overdueInvoices,
      staleDrafts,
      unprojected: buildUnprojected(unprojectedRows),
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
  now,
  tz,
}: {
  target: string | number | null | undefined;
  unit: string | null | undefined;
  monthSeconds: number;
  now: Date;
  tz: string;
}) {
  if (target == null || unit == null) return null;

  const goal = Number(target);
  const { elapsed, total } = businessDaysInLocalMonth(now, tz);

  // A month whose 1st falls on a weekend has zero business days elapsed that
  // day. Dividing by it would report any target as infinitely behind.
  const expected = total === 0 ? 0 : goal * (Math.max(elapsed, 1) / total);

  /* Only `hours` is computable from time entries alone. Revenue pace needs
     invoiced totals plus unbilled-at-resolved-rate — a different query — and
     reporting hours against a money target would be a category error, so the
     card is told the figure is unavailable rather than shown a wrong bar. */
  if (unit !== 'hours') {
    return {
      unit,
      target: goal,
      actual: null,
      expected: null,
      delta: null,
      businessDaysElapsed: elapsed,
      businessDaysTotal: total,
    };
  }

  const actual = monthSeconds / 3600;
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
