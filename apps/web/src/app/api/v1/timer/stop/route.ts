import { NextResponse } from 'next/server';
import { handle, refused } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { findRunning } from '@/lib/timer';
import { pushTimerChanged } from '@/lib/push';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { askedToInclude, readIncluded } from '@/lib/include';
import {
  buildUnbilled,
  refusals,
  stopOrderRefusal,
  type UnbilledRow,
} from '@stint/core';
import { StopTimer } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/timer/stop
 *
 * Stopping is idempotent in effect but not silently so: a second call
 * returns 409 NO_TIMER_RUNNING rather than pretending to succeed, because
 * a client that thinks it stopped a timer it did not stop would display
 * the wrong state.
 *
 * Returns Unbilled beside the entry, read after the stop so it counts it:
 * the menu bar shows that figure, and would otherwise wait on a full refresh
 * for it. `?include=` adds `included`.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, StopTimer);
  const asked = askedToInclude(req);

  const endedAt = body.endedAt ?? new Date().toISOString();

  const running = await findRunning(db);
  if (!running) throw refused(refusals.noTimer);
  // Before the check constraint, which says it less usefully.
  const backdated = stopOrderRefusal(running.startedAt, endedAt);
  if (backdated) throw refused(backdated);

  const { data, error } = await db
    .from('time_entries')
    .update({ ended_at: endedAt })
    .eq('id', running.id)
    .is('ended_at', null)
    .select(ENTRY_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  // Lost the race to another device stopping the same timer.
  if (!data) throw refused(refusals.noTimer);
  pushTimerChanged(db, userId);

  const [unbilled, settings, included] = await Promise.all([
    db.rpc('unbilled_by_client', { p_user_id: userId }),
    db.from('user_settings').select('currency').maybeSingle(),
    readIncluded(asked, db, userId),
  ]);
  if (unbilled.error) throw unbilled.error;
  if (settings.error) throw settings.error;

  const currency = settings.data?.currency ?? 'USD';
  return NextResponse.json({
    entry: toEntry(data as EntryRow),
    currency,
    unbilled: buildUnbilled(
      (unbilled.data ?? []) as UnbilledRow[],
      currency,
      new Date(),
    ),
    ...(included && { included }),
  });
});
