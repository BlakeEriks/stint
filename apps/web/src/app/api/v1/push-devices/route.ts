import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { RegisterPushDevice, UnregisterPushDevice } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** POST /api/v1/push-devices: this phone hears when the timer changes.
 *  Registering a token again changes nothing. */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, RegisterPushDevice);

  const { error } = await db
    .from('push_devices')
    .upsert(
      { user_id: userId, token: body.token, platform: body.platform },
      { onConflict: 'user_id,token', ignoreDuplicates: true },
    );
  if (error) throw error;
  return new NextResponse(null, { status: 204 });
});

/** DELETE /api/v1/push-devices: on sign-out. A token never registered is
 *  already gone, so it answers the same. */
export const DELETE = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, UnregisterPushDevice);

  const { error } = await db
    .from('push_devices')
    .delete()
    .eq('user_id', userId)
    .eq('token', body.token);
  if (error) throw error;
  return new NextResponse(null, { status: 204 });
});
