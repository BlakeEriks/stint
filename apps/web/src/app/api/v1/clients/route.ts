import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { CLIENT_COLUMNS, toClient } from '@/lib/rows';
import { uuidv7 } from '@stint/core';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ListQuery = z.object({
  includeArchived: z.enum(['true', 'false']).default('false'),
});

export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListQuery);

  let query = db.from('clients').select(CLIENT_COLUMNS).order('name');
  if (q.includeArchived === 'false') query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;

  return NextResponse.json({ clients: (data ?? []).map(toClient) });
});

const CreateClient = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(200),
  email: z.email().nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  hourlyRate: z.number().nonnegative().nullable().optional(),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateClient);

  const { data, error } = await db
    .from('clients')
    .insert({
      id: body.id ?? uuidv7(),
      user_id: userId,
      name: body.name,
      email: body.email ?? null,
      address: body.address ?? null,
      hourly_rate: body.hourlyRate ?? null,
      tax_rate: body.taxRate ?? null,
      currency: body.currency ?? null,
      color: body.color ?? null,
    })
    .select(CLIENT_COLUMNS)
    .single();

  if (error) {
    // Replayed offline mutation — return what already exists.
    if (error.code === '23505' && body.id) {
      const { data: existing } = await db
        .from('clients').select(CLIENT_COLUMNS).eq('id', body.id).maybeSingle();
      if (existing) return NextResponse.json(toClient(existing));
    }
    throw error;
  }

  return NextResponse.json(toClient(data), { status: 201 });
});
