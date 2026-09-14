import { NextResponse } from 'next/server';
import { handle, ApiError, isBilledLock } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { findRunning, maxTimerHours, exceeds } from '@/lib/timer';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { UpdateRunningTimer } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/timer/current
 *
 * `serverTime` is returned so clients can correct for device clock skew
 * rather than trusting their own clock for elapsed time.
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);

  const [entry, hours] = await Promise.all([
    findRunning(db),
    maxTimerHours(db),
  ]);

  return NextResponse.json({
    entry,
    exceedsThreshold: entry ? exceeds(entry.startedAt, hours) : false,
    maxTimerHours: hours,
    serverTime: new Date().toISOString(),
  });
});

/** PATCH /api/v1/timer/current — retitle or reassign a running timer. */
export const PATCH = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const patch = await parseBody(req, UpdateRunningTimer);

  const update: Record<string, unknown> = {};
  if (patch.taskName !== undefined) update.task_name = patch.taskName;
  if (patch.projectId !== undefined) update.project_id = patch.projectId;

  if (Object.keys(update).length === 0) {
    const entry = await findRunning(db);
    if (!entry) throw new ApiError('NO_TIMER_RUNNING', 'No timer is running');
    return NextResponse.json(entry);
  }

  const { data, error } = await db
    .from('time_entries')
    .update(update)
    .is('ended_at', null)
    .select(ENTRY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isBilledLock(error)) {
      throw new ApiError(
        'ENTRY_LOCKED',
        'This entry is billed and cannot be modified',
      );
    }
    throw error;
  }
  if (!data) throw new ApiError('NO_TIMER_RUNNING', 'No timer is running');

  return NextResponse.json(toEntry(data as EntryRow));
});
