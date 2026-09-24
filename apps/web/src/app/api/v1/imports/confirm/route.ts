import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { readImport } from '@/lib/import';

export const dynamic = 'force-dynamic';

const CHUNK = 500;

/**
 * POST /api/v1/imports/confirm — writes what the same file previews as.
 *
 * Every id is derived from the file, so each insert skips rows that already
 * exist: a retry after a partial failure, or the same file uploaded twice,
 * adds nothing twice.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const preview = await readImport(req, db, userId);

  if (preview.newClients.length) {
    const { error } = await db.from('clients').upsert(
      preview.newClients.map((c) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  if (preview.newProjects.length) {
    const { error } = await db.from('projects').upsert(
      preview.newProjects.map((p) => ({
        id: p.id,
        user_id: userId,
        client_id: p.clientId,
        name: p.name,
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  const rows = preview.rows.filter((r) => r.willWrite);
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await db
      .from('time_entries')
      .upsert(
        rows.slice(i, i + CHUNK).map((r) => ({
          id: r.id,
          user_id: userId,
          project_id: r.projectId,
          task_name: r.taskName,
          started_at: r.startedAt,
          ended_at: r.endedAt,
          is_billable: r.billable,
          invoiced_elsewhere: r.invoicedElsewhere,
          // Null so the rate resolves live through the chain, as for any entry.
          rate_override: null,
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw error;
    written += data?.length ?? 0;
  }

  return NextResponse.json({
    source: preview.source,
    written,
    alreadyImported: rows.length - written,
    unrated: preview.summary.unratedCount,
    overlapping: preview.summary.overlappingCount,
    excluded: preview.summary.excludedCount,
    invoicedElsewhere: preview.summary.invoicedElsewhereCount,
  });
});
