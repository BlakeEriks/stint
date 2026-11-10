import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { callerToken, requireSession } from '@/lib/auth';
import { revokeApp } from '@/lib/grants';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ clientId: string }> };

/** Revokes the app: its tokens stop working at its next request. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { clientId } = await ctx.params;
  await revokeApp(await callerToken(req, db), clientId);
  return new NextResponse(null, { status: 204 });
});
