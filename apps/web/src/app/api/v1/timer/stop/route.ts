import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { findRunning } from '@/lib/timer';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const StopTimer = z.object({
  endedAt: z.iso.datetime({ offset: true }).optional(),
});

/**
 * POST /api/v1/timer/stop
 *
 * Stopping is idempotent in effect but not silently so: a second call
 * returns 409 NO_TIMER_RUNNING rather than pretending to succeed, because
 * a client that thinks it stopped a timer it did not stop would display
 * the wrong state.
 */
export const POST = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const body = await parseBody(req, StopTimer);

  const endedAt = body.endedAt ?? new Date().toISOString();

  const running = await findRunning(db);
  if (!running) throw new ApiError('NO_TIMER_RUNNING', 'No timer is running');

  // A backdated stop must still land after the start, or the check
  // constraint rejects it with a less useful message.
  if (new Date(endedAt) <= new Date(running.startedAt)) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'endedAt must be after the entry started',
      { startedAt: running.startedAt, endedAt },
    );
  }

  const { data, error } = await db
    .from('time_entries')
    .update({ ended_at: endedAt })
    .eq('id', running.id)
    .is('ended_at', null)
    .select(ENTRY_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  // Lost the race to another device stopping the same timer.
  if (!data) throw new ApiError('NO_TIMER_RUNNING', 'No timer is running');

  return NextResponse.json(toEntry(data as EntryRow));
});
