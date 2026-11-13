import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { computeInvoice } from '@/lib/drafts';
import { loadBilledSpans } from '@/lib/billed-spans';
import { selectAll } from '@/lib/select-all';
import {
  addDays,
  billingWindow,
  buildOverlaps,
  buildSchedules,
  earlierWork,
  earlierWorkFrom,
} from '@stint/core';
import { InvoicePreviewRequest } from '@stint/schema';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** The client's billable work New invoice offers to include
    (`earlierWork()`). The edited draft doesn't end the look-back, and what
    it holds counts as free, as the preview's own lines do. */
async function loadEarlierWork(
  db: SupabaseClient,
  opts: { clientId: string; periodStart: string; tz: string; draftId?: string },
) {
  const [{ data: invoices, error }, { data: projects, error: projectError }] =
    await Promise.all([
      db
        .from('invoices')
        .select('id, period_start, period_end')
        .eq('client_id', opts.clientId)
        .neq('status', 'void'),
      db.from('projects').select('id').eq('client_id', opts.clientId),
    ]);
  if (error) throw error;
  if (projectError) throw projectError;
  const others = (invoices ?? []).filter((i) => i.id !== opts.draftId);
  const from = earlierWorkFrom(
    opts.periodStart,
    others.map((i) => ({
      periodStart: i.period_start as string,
      periodEnd: i.period_end as string,
    })),
  );
  if (!from) return null;
  const window = billingWindow(from, addDays(opts.periodStart, -1), opts.tz);
  const rows = await selectAll(() => {
    const q = db
      .from('time_entries')
      .select('started_at')
      .in(
        'project_id',
        (projects ?? []).map((p) => p.id as string),
      )
      .is('invoice_id', null)
      .eq('invoiced_elsewhere', false)
      .eq('is_billable', true)
      .not('ended_at', 'is', null)
      .gte('started_at', window.start.toISOString())
      .lt('started_at', window.end.toISOString());
    return opts.draftId
      ? q.or(`draft_id.is.null,draft_id.eq.${opts.draftId}`)
      : q.is('draft_id', null);
  });
  return earlierWork(
    rows.map((r) => ({ startedAt: r.started_at as string })),
    opts.tz,
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
      '`periodEnd` must not precede `periodStart`',
    );
  }

  const { client, settings, entries, totals, tz } = await computeInvoice(db, {
    clientId: body.clientId,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    tz: { device: body.tz },
    groupingMode: body.groupingMode,
    summaryText: body.summaryText,
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
    earlierWork: await loadEarlierWork(db, {
      clientId: body.clientId,
      periodStart: body.periodStart,
      tz,
      draftId: body.draftId,
    }),
    schedules:
      body.groupingMode === 'summary'
        ? buildSchedules(entries, {
            tz,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd,
          })
        : null,
  });
});
