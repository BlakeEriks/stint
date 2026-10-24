import { NextResponse } from 'next/server';
import { ApiError, handle } from '@/lib/errors';
import { runDrafts } from '@/lib/auto-drafts';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cron/drafts — the daily job, called by Vercel Cron
 * (`vercel.json`), which sends `CRON_SECRET` as a bearer token. Refused
 * without it, and while it is unset, so no one else can run it.
 */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    throw new ApiError('UNAUTHORIZED', 'Not the scheduler');
  return NextResponse.json(await runDrafts(serviceClient()));
});
