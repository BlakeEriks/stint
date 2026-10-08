import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { PROJECT_COLUMNS, toProject } from '@/lib/rows';
import { uuidv7 } from '@stint/core';
import { CreateProject, ListProjectsQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListProjectsQuery);

  let query = db.from('projects').select(PROJECT_COLUMNS).order('name');
  if (!q.includeArchived) query = query.is('archived_at', null);
  if (q.clientId) query = query.eq('client_id', q.clientId);

  /* A project whose client is archived counts as archived, so nothing offers
     it for new time. Read, not written: unarchiving the client brings back
     exactly what was active before. */
  const [{ data, error }, archived] = await Promise.all([
    query,
    q.includeArchived
      ? null
      : db.from('clients').select('id').not('archived_at', 'is', null),
  ]);
  if (error) throw error;
  if (archived?.error) throw archived.error;
  const gone = new Set((archived?.data ?? []).map((c) => c.id));

  return NextResponse.json({
    projects: (data ?? [])
      .filter((p) => !p.client_id || !gone.has(p.client_id))
      .map(toProject),
  });
});

export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateProject);

  const { data, error } = await db
    .from('projects')
    .insert({
      id: body.id ?? uuidv7(),
      user_id: userId,
      client_id: body.clientId ?? null,
      name: body.name,
      hourly_rate: body.hourlyRate ?? null,
      is_billable_default: body.isBillableDefault ?? true,
    })
    .select(PROJECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505' && body.id) {
      const { data: existing } = await db
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('id', body.id)
        .maybeSingle();
      if (existing) return NextResponse.json(toProject(existing));
    }
    throw error;
  }

  return NextResponse.json(toProject(data), { status: 201 });
});
