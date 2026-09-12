import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { PROJECT_COLUMNS, toProject } from '@/lib/rows';
import { uuidv7 } from '@stint/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  clientId: z.uuid().optional(),
  includeArchived: z.enum(['true', 'false']).default('false'),
});

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListQuery);

  let query = db.from('projects').select(PROJECT_COLUMNS).order('name');
  if (q.includeArchived === 'false') query = query.is('archived_at', null);
  if (q.clientId) query = query.eq('client_id', q.clientId);

  const { data, error } = await query;
  if (error) throw error;

  return NextResponse.json({ projects: (data ?? []).map(toProject) });
});

const CreateProject = z.object({
  id: z.uuid().optional(),
  clientId: z.uuid().nullable().optional(), // null = internal / unbilled
  name: z.string().trim().min(1).max(200),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  isBillableDefault: z.boolean().optional(),
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
