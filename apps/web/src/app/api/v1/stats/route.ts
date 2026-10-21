import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { readStats } from '@/lib/stats';
import { StatsQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** GET /api/v1/stats — `readStats` says what it holds. */
export const GET = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const { tz } = parseQuery(req, StatsQuery);
  return NextResponse.json(await readStats(db, userId, tz));
});
