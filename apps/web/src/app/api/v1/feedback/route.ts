import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { CreateFeedback } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** POST /api/v1/feedback. The sender is the session, never the body. */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateFeedback);

  const { error } = await db.from('feedback').insert({
    id: body.id,
    user_id: userId,
    message: body.message,
    screen: body.screen,
    client: body.client,
    app_version: body.appVersion,
  });

  if (error) {
    // Select-own RLS: a visible row with this id is this user's earlier send.
    const retried =
      error.code === '23505' &&
      (await db.from('feedback').select('id').eq('id', body.id).maybeSingle())
        .data;
    if (!retried) throw error;
    return NextResponse.json({ id: body.id });
  }

  return NextResponse.json({ id: body.id }, { status: 201 });
});
