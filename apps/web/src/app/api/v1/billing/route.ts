import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { entitlement } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/** GET /api/v1/billing — the caller's plan. Answers even with Stripe unset. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  return NextResponse.json(await entitlement(db));
});
