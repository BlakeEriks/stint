import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { CLIENT_COLUMNS, toClient } from '@/lib/rows';
import { uuidv7 } from '@stint/core';
import { CreateClient, ListClientsQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  const { db, userId } = await requireSession(req);
  const q = parseQuery(req, ListClientsQuery);

  let query = db.from('clients').select(CLIENT_COLUMNS).order('name');
  if (!q.includeArchived) query = query.is('archived_at', null);

  const { data, error } = await query;
  if (error) throw error;
  const clients = (data ?? []).map(toClient);

  if (!q.withScale) return NextResponse.json({ clients });

  /* The same rollup the home card uses, UNTRUNCATED. `/stats` caps it at the
     top five, which is right for a card and wrong for a full list: the sixth
     client would show no figure, and a missing amount reads as "nothing
     owed" rather than "not shown". */
  const [projects, unbilled] = await Promise.all([
    db.from('projects').select('client_id').is('archived_at', null),
    db.rpc('unbilled_by_client', { p_user_id: userId }),
  ]);
  if (projects.error) throw projects.error;
  if (unbilled.error) throw unbilled.error;

  const counts = new Map<string, number>();
  for (const row of (projects.data ?? []) as { client_id: string | null }[]) {
    if (!row.client_id) continue;
    counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
  }

  const owed = new Map<string, number>();
  for (const row of (unbilled.data ?? []) as {
    client_id: string | null;
    amount: string | number;
  }[]) {
    if (!row.client_id) continue;
    owed.set(row.client_id, Number(row.amount));
  }

  return NextResponse.json({
    clients: clients.map((c) => ({
      ...c,
      projectCount: counts.get(c.id) ?? 0,
      unbilledAmount: owed.get(c.id) ?? 0,
    })),
  });
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
      payment_profile_id: body.paymentProfileId ?? null,
    })
    .select(CLIENT_COLUMNS)
    .single();

  if (error) {
    // Replayed offline mutation — return what already exists.
    if (error.code === '23505' && body.id) {
      const { data: existing } = await db
        .from('clients')
        .select(CLIENT_COLUMNS)
        .eq('id', body.id)
        .maybeSingle();
      if (existing) return NextResponse.json(toClient(existing));
    }
    throw error;
  }

  return NextResponse.json(toClient(data), { status: 201 });
});
