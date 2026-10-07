import {
  addDays,
  buildAwaitingPayment,
  buildCollected,
  buildEarnedPace,
  buildLineItems,
  buildSchedules,
  buildMonthByClient,
  buildOpenInvoiceCount,
  buildOverdueInvoices,
  buildOverlaps,
  buildStaleDrafts,
  buildStrangeDurations,
  buildUnbilled,
  buildUnprojected,
  buildWeek,
  type ClientRevenueRow,
  clientNamesFrom,
  COLLECTED_MONTHS,
  type DayRow,
  daysSincePaid,
  entrySeconds,
  measured,
  type GroupingMode,
  localDateKey,
  localMonthKeys,
  type ManualLine,
  OVERDUE_GRACE_DAYS,
  projectNamesFrom,
  resolveRate,
  revenueByDay,
  STALE_DRAFT_DAYS,
  startOfLocalDate,
  startOfLocalDay,
  startOfLocalDayOffset,
  startOfLocalMonth,
  startOfLocalMonthsBack,
  startOfLocalWeek,
  startOfNextLocalMonth,
  type UnbilledRow,
} from '@stint/core';
import type { Expense, TimeEntry } from '@/lib/client/api';
import { billable, type Db } from './fixtures';

/**
 * What the routes compute, computed from the fake account. The SQL rollups
 * become the few reductions below; everything after them is the same
 * `@stint/core` builder the route calls, so Home, the dock, the calendar and
 * the timer can never disagree with each other.
 */

const stopped = (e: TimeEntry) => e.endedAt !== null;
const at = (iso: string) => new Date(iso).getTime();

/** A stopped entry's length, or a running one's so far: `entry_seconds`. */
const secondsOf = (db: Db, e: TimeEntry) =>
  measured(e, db.now).durationSeconds ?? 0;

function clientOf(db: Db, projectId: string | null) {
  const p = db.projects.find((x) => x.id === projectId);
  return p?.clientId ?? null;
}

function rateOf(db: Db, e: TimeEntry) {
  const p = db.projects.find((x) => x.id === e.projectId);
  const c = db.clients.find((x) => x.id === p?.clientId);
  return resolveRate({
    entryRateOverride: e.rateOverride,
    projectRate: p?.hourlyRate,
    clientRate: c?.hourlyRate,
    userDefaultRate: db.settings.defaultHourlyRate,
  });
}

/**
 * `round(sum(hours) * rate, 2)` per rate, where each entry's hours are its
 * printed two decimals, as the SQL rollups and `buildLineItems` do.
 */
function earned(db: Db, entries: TimeEntry[]) {
  const byRate = new Map<
    number | null,
    { seconds: number; hundredths: number }
  >();
  for (const e of entries) {
    const rate = rateOf(db, e);
    const seconds = secondsOf(db, e);
    const acc = byRate.get(rate) ?? { seconds: 0, hundredths: 0 };
    byRate.set(rate, {
      seconds: acc.seconds + seconds,
      hundredths: acc.hundredths + Math.round(seconds / 36),
    });
  }
  let amount: number | null = null;
  for (const [rate, { hundredths }] of byRate)
    if (rate !== null)
      amount =
        (amount ?? 0) +
        Math.round((hundredths * Math.round(rate * 100)) / 100) / 100;
  return {
    seconds: [...byRate.values()].reduce((a, b) => a + b.seconds, 0),
    amount,
    unrated: entries.filter((e) => rateOf(db, e) === null).length,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

const unbilled = (db: Db) =>
  db.entries.filter((e) => e.invoiceId === null && e.isBillable);

/** `unbilled_by_client`. */
function unbilledRows(db: Db): UnbilledRow[] {
  return [...groupBy(unbilled(db), (e) => clientOf(db, e.projectId) ?? '')]
    .map(([clientId, entries]) => {
      const c = db.clients.find((x) => x.id === clientId);
      const e = earned(db, entries);
      return {
        client_id: c?.id ?? null,
        client_name: c?.name ?? null,
        currency: c?.currency ?? db.settings.currency,
        seconds: e.seconds,
        amount: e.amount ?? 0,
        unrated_count: e.unrated,
        oldest_at: entries.map((x) => x.startedAt).sort()[0] as string,
      };
    })
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** Billable work in a window, running included, less anything on a void
 *  invoice. */
function earnedIn(db: Db, from: Date, to: Date) {
  return db.entries.filter(
    (e) =>
      e.isBillable &&
      at(e.startedAt) >= from.getTime() &&
      at(e.startedAt) < to.getTime() &&
      db.invoices.find((i) => i.id === e.invoiceId)?.status !== 'void',
  );
}

/** `revenue_by_day`. */
function dayRows(db: Db, from: Date, to: Date, tz: string): DayRow[] {
  return [
    ...groupBy(earnedIn(db, from, to), (e) =>
      localDateKey(new Date(e.startedAt), tz),
    ),
  ].map(([day, entries]) => {
    const { seconds, amount } = earned(db, entries);
    return { day, seconds, amount };
  });
}

/** `revenue_by_client`. */
function clientRows(db: Db, from: Date, to: Date): ClientRevenueRow[] {
  return [
    ...groupBy(earnedIn(db, from, to), (e) => clientOf(db, e.projectId) ?? ''),
  ].map(([clientId, entries]) => ({
    client_id: clientId || null,
    client_name: db.clients.find((c) => c.id === clientId)?.name ?? null,
    seconds: earned(db, entries).seconds,
    invoiced:
      earned(
        db,
        entries.filter((e) => e.invoiceId),
      ).amount ?? 0,
    unbilled:
      earned(
        db,
        entries.filter((e) => !e.invoiceId),
      ).amount ?? 0,
  }));
}

export function summary(db: Db, tz: string) {
  const { now } = db;
  const dayStart = startOfLocalDay(now, tz).getTime();
  const weekStart = startOfLocalWeek(now, tz, db.settings.weekStartsOn);
  const running = db.entries.find((e) => !stopped(e)) ?? null;

  let todaySeconds = 0;
  let weekSeconds = 0;
  for (const e of db.entries) {
    if (!stopped(e) || at(e.startedAt) < weekStart.getTime()) continue;
    weekSeconds += e.durationSeconds ?? 0;
    if (at(e.startedAt) >= dayStart) todaySeconds += e.durationSeconds ?? 0;
  }
  const live = running ? entrySeconds(running.startedAt, now) : 0;
  if (running) {
    weekSeconds += live;
    if (at(running.startedAt) >= dayStart) todaySeconds += live;
  }
  return {
    running,
    todaySeconds,
    weekSeconds,
    serverTime: now.toISOString(),
  };
}

export function unbilledSummary(db: Db) {
  return buildUnbilled(unbilledRows(db), db.settings.currency, db.now);
}

/** `GET /stats`, following `src/app/api/v1/stats/route.ts` step for step. */
export function stats(db: Db, tz: string) {
  const { now, settings } = db;
  const currency = settings.currency;
  const monthStart = startOfLocalMonth(now, tz);
  const monthEnd = startOfNextLocalMonth(now, tz);
  const todayKey = localDateKey(now, tz);

  const byDay = revenueByDay(dayRows(db, monthStart, monthEnd, tz));
  const weekStartKey = localDateKey(
    startOfLocalWeek(now, tz, settings.weekStartsOn),
    tz,
  );
  const week = buildWeek(
    dayRows(
      db,
      startOfLocalDayOffset(now, tz, 6),
      startOfLocalDayOffset(now, tz, -7),
      tz,
    ),
    Array.from({ length: 7 }, (_, i) => addDays(weekStartKey, i)),
  );

  const rows = unbilledRows(db);
  const clientNames = clientNamesFrom(rows);
  const open = db.invoices
    .filter((i) => i.status === 'sent' || i.status === 'draft')
    .map((i) => ({
      id: i.id,
      invoice_number: i.invoiceNumber,
      client_id: i.clientId,
      status: i.status,
      due_date: i.dueDate,
      total: i.total,
      currency: i.currency,
      issue_date: i.issueDate,
    }));

  const candidates = db.entries
    .filter((e) => e.invoiceId === null && stopped(e))
    .sort((a, b) => at(a.startedAt) - at(b.startedAt));
  const span = (e: TimeEntry) => ({
    id: e.id,
    task_name: e.taskName,
    started_at: e.startedAt,
    duration_seconds: e.durationSeconds,
  });
  const unprojected = candidates
    .filter((e) => e.projectId === null && e.isBillable)
    .map(span);

  const collectedStart = startOfLocalMonthsBack(now, tz, COLLECTED_MONTHS - 1);
  const paid = db.invoices.filter(
    (i) => i.status === 'paid' && i.paidAt && i.currency === currency,
  );
  const lastPaid = paid
    .map((i) => i.paidAt as string)
    .sort()
    .at(-1);

  return {
    currency,
    unbilled: buildUnbilled(rows, currency, now),
    earnedToday: byDay.get(todayKey) ?? 0,
    week,
    month: {
      ...buildEarnedPace({ byDay, now, tz }),
      byClient: buildMonthByClient(clientRows(db, monthStart, monthEnd)),
    },
    awaitingPayment: buildAwaitingPayment(open),
    openInvoiceCount: buildOpenInvoiceCount(open),
    collected: buildCollected(
      paid
        .filter(
          (i) =>
            at(i.paidAt as string) >= collectedStart.getTime() &&
            at(i.paidAt as string) < monthEnd.getTime(),
        )
        .map((i) => ({
          month: localDateKey(new Date(i.paidAt as string), tz).slice(0, 7),
          currency: i.currency,
          amount: i.total,
        })),
      localMonthKeys(now, tz, COLLECTED_MONTHS),
      lastPaid ? daysSincePaid(lastPaid, now, tz) : null,
      currency,
    ),
    attention: {
      overdueInvoices: buildOverdueInvoices(
        open,
        clientNames,
        currency,
        todayKey,
        localDateKey(startOfLocalDayOffset(now, tz, OVERDUE_GRACE_DAYS), tz),
      ),
      staleDrafts: buildStaleDrafts(
        open,
        clientNames,
        currency,
        todayKey,
        localDateKey(startOfLocalDayOffset(now, tz, STALE_DRAFT_DAYS), tz),
      ),
      unprojected: buildUnprojected(unprojected),
      strangeDurations: buildStrangeDurations(
        candidates
          .filter((e) => !e.durationOk)
          .map((e) => ({ ...span(e), project_id: e.projectId })),
        settings.minEntrySeconds,
        settings.maxEntryHours,
        projectNamesFrom(
          db.projects.map((p) => ({
            id: p.id,
            name: p.name,
            client_id: p.clientId,
          })),
          clientNames,
        ),
        new Set(unprojected.map((r) => r.id)),
      ),
      overlaps: buildOverlaps(
        candidates.map((e) => ({
          id: e.id,
          task_name: e.taskName,
          started_at: e.startedAt,
          ended_at: e.endedAt as string,
        })),
      ),
    },
  };
}

/** `GET /calendar`: entries by local day, or per-client totals by day. */
export function calendar(
  db: Db,
  q: { from: string; to: string; tz: string; granularity: string | null },
) {
  const inRange = db.entries
    .filter((e) => at(e.startedAt) >= at(q.from) && at(e.startedAt) <= at(q.to))
    .sort((a, b) => at(a.startedAt) - at(b.startedAt));
  const byDay = groupBy(inRange, (e) =>
    localDateKey(new Date(e.startedAt), q.tz),
  );

  // Totals count stopped work only, so a day holding just a running timer
  // has no row, as in the route.
  if (q.granularity === 'day')
    return [
      ...groupBy(inRange.filter(stopped), (e) =>
        localDateKey(new Date(e.startedAt), q.tz),
      ),
    ].map(([date, entries]) => {
      const byClient: Record<string, number> = {};
      let totalSeconds = 0;
      for (const e of entries) {
        totalSeconds += e.durationSeconds ?? 0;
        if (!e.isBillable) continue;
        const client = clientOf(db, e.projectId) ?? '';
        byClient[client] = (byClient[client] ?? 0) + (e.durationSeconds ?? 0);
      }
      return { date, totalSeconds, byClient };
    });

  return [...byDay].map(([date, entries]) => ({
    date,
    totalSeconds: entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0),
    entries,
  }));
}

/** `recent_task_names`: one row per name, the project's names first. */
export function taskNames(db: Db, projectId: string | null, limit: number) {
  const latest = new Map<string, TimeEntry>();
  const newestFirst = [...db.entries].sort(
    (a, b) => at(b.startedAt) - at(a.startedAt),
  );
  for (const e of newestFirst) {
    const key = e.taskName.toLowerCase();
    const seen = latest.get(key);
    if (!e.taskName) continue;
    if (
      !seen ||
      (projectId && e.projectId === projectId && seen.projectId !== projectId)
    )
      latest.set(key, e);
  }
  /* `coalesce(project_id = p_project_id, false)`: with no project asked for,
     nothing is preferred. A bare `===` would rank every null-project name
     first, since null equals null. */
  const preferred = (e: TimeEntry) =>
    projectId !== null && e.projectId === projectId;
  return [...latest.values()]
    .sort(
      (a, b) =>
        Number(preferred(b)) - Number(preferred(a)) ||
        at(b.startedAt) - at(a.startedAt),
    )
    .slice(0, limit)
    .map((e) => ({
      taskName: e.taskName,
      projectId: e.projectId,
      lastUsedAt: e.startedAt,
    }));
}

/** Project count and what is owed, for the clients list. */
export function withScale(db: Db) {
  const owed = new Map(unbilledRows(db).map((r) => [r.client_id, r.amount]));
  return (c: Db['clients'][number]) => ({
    ...c,
    projectCount: db.projects.filter(
      (p) => p.clientId === c.id && p.archivedAt === null,
    ).length,
    unbilledAmount: Number(owed.get(c.id) ?? 0),
  });
}

export interface PreviewRequest {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  groupingMode?: GroupingMode;
  summaryText?: string;
  tz?: string;
  manualLines?: ManualLine[];
  excludedExpenseIds?: string[];
}

/** An expense as the API returns it: its invoice's number and status are
    read now, so sending or voiding the invoice is never out of date here. */
export function expenseView(db: Db, e: Expense): Expense {
  const invoice = db.invoices.find((i) => i.id === e.invoiceId);
  return {
    ...e,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceStatus: invoice?.status ?? null,
  };
}

/**
 * `loadBillableExpenses`: every recurring expense, dated the period's end,
 * and every unbilled one-off dated on or before it, less the excluded.
 */
export function billableExpenses(db: Db, body: PreviewRequest) {
  return db.expenses
    .filter(
      (e) =>
        e.clientId === body.clientId &&
        e.invoiceId === null &&
        (e.recurring || (e.spentOn as string) <= body.periodEnd) &&
        !body.excludedExpenseIds?.includes(e.id),
    )
    .map(({ id, recurring, spentOn, description, amount }) => ({
      id,
      recurring,
      spentOn: spentOn ?? body.periodEnd,
      description,
      amount,
    }));
}

/** `POST /invoices/preview`: the client's unbilled work in the period. */
export function invoicePreview(db: Db, body: PreviewRequest, tz: string) {
  const client = db.clients.find((c) => c.id === body.clientId);
  if (!client) return undefined;
  const from = startOfLocalDate(body.periodStart, tz).getTime();
  const to = startOfLocalDate(addDays(body.periodEnd, 1), tz).getTime();
  const entries = db.entries
    .filter(
      (e) =>
        clientOf(db, e.projectId) === client.id &&
        e.invoiceId === null &&
        stopped(e) &&
        at(e.startedAt) >= from &&
        at(e.startedAt) < to,
    )
    // `loadBillableEntries` reads them oldest first, which orders a line's entries.
    .sort((a, b) => at(a.startedAt) - at(b.startedAt));
  const groupingMode = body.groupingMode ?? 'entry';
  const rated = billable(
    entries,
    db.projects,
    db.clients,
    db.settings.defaultHourlyRate,
  );
  return {
    clientId: client.id,
    clientName: client.name,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    groupingMode,
    currency: client.currency ?? db.settings.currency,
    ...buildLineItems(rated, {
      groupingMode,
      summaryText: body.summaryText?.trim() ?? '',
      taxRate: client.taxRate ?? 0,
      tz,
      manualLines: body.manualLines,
      expenses: billableExpenses(db, body),
    }),
    schedules:
      groupingMode === 'summary'
        ? buildSchedules(rated, {
            tz,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
          })
        : null,
  };
}
