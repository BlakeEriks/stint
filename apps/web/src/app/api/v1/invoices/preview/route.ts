import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  clientProjectIds,
  computeInvoice,
  unbilledEntries,
} from '@/lib/drafts';
import { loadBilledSpans } from '@/lib/billed-spans';
import { selectAll } from '@/lib/select-all';
import {
  addDays,
  billingWindow,
  buildOverlaps,
  buildSchedules,
  earlierWork,
  earlierWorkFrom,
  heldWork,
} from '@stint/core';
import { InvoicePreviewRequest } from '@stint/schema';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The client's billable work New invoice offers to include
    (`earlierWork()`). The edited draft doesn't end the look-back, and what
    it holds counts as free, as the preview's own lines do. */
async function loadEarlierWork(
  db: SupabaseClient,
  opts: {
    clientId: string;
    projectIds: string[];
    periodStart: string;
    tz: string;
    draftId?: string;
  },
) {
  const { data: invoices, error } = await db
    .from('invoices')
    .select('id, period_start, period_end')
    .eq('client_id', opts.clientId)
    .neq('status', 'void');
  if (error) throw error;
  const others = (invoices ?? []).filter((i) => i.id !== opts.draftId);
  const from = earlierWorkFrom(
    opts.periodStart,
    others.map((i) => ({
      periodStart: i.period_start as string,
      periodEnd: i.period_end as string,
    })),
  );
  if (!from) return null;
  const rows = await selectAll(() =>
    unbilledEntries(db, {
      projectIds: opts.projectIds,
      select: 'started_at',
      drafts: 'free',
      draftId: opts.draftId,
      window: billingWindow(from, addDays(opts.periodStart, -1), opts.tz),
      billableOnly: true,
    }),
  );
  return earlierWork(
    rows.map((r) => ({ startedAt: r.started_at as string })),
    opts.tz,
  );
}

/** The period's billable work other drafts hold (`heldWork()`): what the
    preview would bill if no draft held it. */
async function loadHeldWork(
  db: SupabaseClient,
  opts: {
    projectIds: string[];
    periodStart: string;
    periodEnd: string;
    tz: string;
    draftId?: string;
  },
) {
  const rows = await selectAll(() =>
    unbilledEntries(db, {
      projectIds: opts.projectIds,
      select: 'draft_id',
      drafts: 'others',
      window: billingWindow(opts.periodStart, opts.periodEnd, opts.tz),
      billableOnly: true,
    }),
  );
  if (rows.length === 0) return null;
  const entries = rows.map((r) => ({ draftId: r.draft_id as string }));
  const { data: drafts, error } = await db
    .from('invoices')
    .select('id, invoice_number, sequence_no')
    .in('id', [...new Set(entries.map((e) => e.draftId))]);
  if (error) throw error;
  return heldWork(
    entries,
    (drafts ?? []).map((d) => ({
      id: d.id as string,
      invoiceNumber: d.invoice_number as string,
      sequenceNo: d.sequence_no as number,
    })),
    opts.draftId,
  );
}

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
      'The period can’t end before it starts.',
    );
  }

  const { client, settings, entries, totals, tz } = await computeInvoice(db, {
    clientId: body.clientId,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    tz: { device: body.tz },
    groupingMode: body.groupingMode,
    summaryText: body.summaryText,
    summaryTexts: body.summaryTexts,
    manualLines: body.manualLines,
    excludedExpenseIds: body.excludedExpenseIds,
    schedules: [],
    draftId: body.draftId,
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
      is_billable: true,
      invoice_number: null,
    }));
  const overlapping = new Set(
    buildOverlaps([...toBill, ...(await loadBilledSpans(db, toBill))]).flatMap(
      (o) => [o.entryId, o.otherEntryId],
    ),
  );

  const projectIds = await clientProjectIds(db, body.clientId);
  const [earlier, held] = await Promise.all([
    loadEarlierWork(db, {
      clientId: body.clientId,
      projectIds,
      periodStart: body.periodStart,
      tz,
      draftId: body.draftId,
    }),
    loadHeldWork(db, {
      projectIds,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      tz,
      draftId: body.draftId,
    }),
  ]);

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
    earlierWork: earlier,
    heldWork: held,
    schedules: buildSchedules(entries, {
      tz,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
    }),
  });
});
