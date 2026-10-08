import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  loadClient,
  loadSettings,
  loadBillableEntries,
  loadBillableExpenses,
} from '@/lib/invoicing';
import { loadBilledSpans } from '@/lib/billed-spans';
import { buildLineItems, buildOverlaps, buildSchedules } from '@stint/core';
import { InvoicePreviewRequest } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/invoices/preview
 *
 * Strictly read-only: no number is allocated, no entry is locked. The UI is
 * expected to call this before POST /invoices, because generation is the
 * irreversible step and must never be a surprise.
 *
 * Returns `unratedEntryIds` so the UI can show exactly which entries block
 * generation, rather than failing with a bare error, and
 * `overlappingEntryIds`: this page is the last chance to catch time about to
 * be billed twice.
 */
export const POST = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const body = await parseBody(req, InvoicePreviewRequest);

  if (body.periodEnd < body.periodStart) {
    throw new ApiError(
      'INVALID_PERIOD',
      '`periodEnd` must not precede `periodStart`',
    );
  }

  const [client, settings] = await Promise.all([
    loadClient(db, body.clientId),
    loadSettings(db),
  ]);

  const clientRate =
    client.hourly_rate == null ? null : Number(client.hourly_rate);
  const taxRate = client.tax_rate == null ? 0 : Number(client.tax_rate);

  const [entries, expenses] = await Promise.all([
    loadBillableEntries(db, {
      clientId: body.clientId,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      tz: body.tz,
      userDefaultRate: settings.defaultHourlyRate,
      clientRate,
    }),
    loadBillableExpenses(db, {
      clientId: body.clientId,
      periodEnd: body.periodEnd,
      excludedIds: body.excludedExpenseIds,
    }),
  ]);

  const totals = buildLineItems(entries, {
    groupingMode: body.groupingMode,
    summaryText: body.summaryText,
    taxRate,
    tz: body.tz,
    manualLines: body.manualLines,
    expenses,
  });

  const toBill = entries
    .filter((e) => e.isBillable)
    .map((e) => ({
      id: e.id,
      task_name: e.taskName,
      started_at: e.startedAt,
      ended_at: new Date(
        Date.parse(e.startedAt) + e.durationSeconds * 1000,
      ).toISOString(),
      invoice_number: null,
    }));
  const overlapping = new Set(
    buildOverlaps([...toBill, ...(await loadBilledSpans(db, toBill))]).flatMap(
      (o) => [o.entryId, o.otherEntryId],
    ),
  );

  return NextResponse.json({
    clientId: body.clientId,
    clientName: client.name,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    groupingMode: body.groupingMode,
    currency: client.currency ?? settings.currency,
    ...totals,
    overlappingEntryIds: toBill
      .map((e) => e.id)
      .filter((id) => overlapping.has(id)),
    schedules:
      body.groupingMode === 'summary'
        ? buildSchedules(entries, {
            tz: body.tz,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
          })
        : null,
  });
});
