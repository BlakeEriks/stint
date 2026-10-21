import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseQuery } from '@/lib/validate';
import { readSummary } from '@/lib/summary';
import { SummaryQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** GET /api/v1/summary — the macOS menu bar's endpoint; `readSummary` says what it holds. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const { tz } = parseQuery(req, SummaryQuery);
  return NextResponse.json(await readSummary(db, tz));
});
