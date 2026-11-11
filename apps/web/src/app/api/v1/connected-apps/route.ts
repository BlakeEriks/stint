import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { callerToken, requireSession } from '@/lib/auth';
import { listApps } from '@/lib/grants';

export const dynamic = 'force-dynamic';

/** GET /api/v1/connected-apps — the apps the user approved. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  return NextResponse.json({
    apps: await listApps(await callerToken(req, db)),
  });
});
