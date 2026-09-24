import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { readImport } from '@/lib/import';

export const dynamic = 'force-dynamic';

/** POST /api/v1/imports/preview — what confirm would write. Writes nothing. */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  return NextResponse.json(await readImport(req, db, userId));
});
