import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { anonClient, testDb } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Postgres refused the query, which it can only do while it is up. */
const PERMISSION_DENIED = '42501';

/**
 * GET /api/v1/health
 *
 * What the uptime monitor polls (`docs/deploying.md` §3c). It sends Postgres
 * a query, so it fails when the database does, not only when Vercel does.
 * No session, so it runs as `anon`: rows, no rows and permission denied all
 * mean Postgres answered. A database that is down answers with a PostgREST
 * or gateway error instead.
 */
export const GET = handle(async () => {
  const db = testDb() ?? anonClient();
  const { error } = await db.from('clients').select('id').limit(1);
  const up = !error || error.code === PERMISSION_DENIED;
  return NextResponse.json({ ok: up }, { status: up ? 200 : 503 });
});
