import { NextResponse } from 'next/server';
import { handle, refused } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { projectBillableDefault } from '@/lib/projects';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { CreateTimeEntry, ListEntriesQuery } from '@stint/schema';
import { measured, replayRefusal } from '@stint/core';

export const dynamic = 'force-dynamic';

/** GET /api/v1/entries — newest first. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListEntriesQuery);

  let query = db
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(q.limit);

  if (q.from) query = query.gte('started_at', q.from);
  if (q.to) query = query.lte('started_at', q.to);
  if (q.projectId === 'none') query = query.is('project_id', null);
  else if (q.projectId) query = query.eq('project_id', q.projectId);

  // Filtering by client means "any project belonging to that client".
  if (q.clientId) {
    const { data: projects, error } = await db
      .from('projects')
      .select('id')
      .eq('client_id', q.clientId);
    if (error) throw error;

    const ids = (projects ?? []).map((p) => p.id);
    if (ids.length === 0) return NextResponse.json({ entries: [] });
    query = query.in('project_id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  /* Measured here, so a list shows the server's figure rather than counting
     on the client's clock. */
  const now = new Date();
  return NextResponse.json({
    entries: (data ?? []).map((r) => measured(toEntry(r as EntryRow), now)),
  });
});

/**
 * POST /api/v1/entries — a completed manual entry.
 *
 * The id is client-supplied (UUIDv7), which makes a replay idempotent:
 * re-sending the same entry returns the stored one instead of creating a
 * duplicate, and re-sending it changed is refused rather than dropped.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateTimeEntry);

  const { data, error } = await db
    .from('time_entries')
    .insert({
      id: body.id,
      user_id: userId,
      project_id: body.projectId ?? null,
      task_name: body.taskName,
      started_at: body.startedAt,
      ended_at: body.endedAt,
      is_billable:
        body.isBillable ?? (await projectBillableDefault(db, body.projectId)),
      rate_override: body.rateOverride ?? null,
    })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) {
    // Replayed mutation: return what is already stored, if it is the same.
    if (error.code === '23505') {
      const { data: existing } = await db
        .from('time_entries')
        .select(ENTRY_COLUMNS)
        .eq('id', body.id)
        .maybeSingle();
      if (existing) {
        const stored = toEntry(existing as EntryRow);
        const refusal = replayRefusal(body, stored);
        if (refusal) throw refused(refusal);
        return NextResponse.json(stored);
      }
    }
    throw error;
  }

  return NextResponse.json(toEntry(data as EntryRow), { status: 201 });
});
