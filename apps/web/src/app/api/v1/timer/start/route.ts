import { NextResponse } from 'next/server';
import { handle, ApiError, isTimerConflict } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import { findRunning } from '@/lib/timer';
import { projectBillableDefault } from '@/lib/projects';
import { ENTRY_COLUMNS, toEntry, type EntryRow } from '@/lib/rows';
import { askedToInclude, entryWith, readIncluded } from '@/lib/include';
import { uuidv7 } from '@stint/core';
import { StartTimer } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/timer/start
 *
 * Rejects with 409 TIMER_ALREADY_RUNNING when one is already running, and
 * returns the running entry in `details` so the client can show it rather
 * than making a second request.
 *
 * The insert is attempted unconditionally: the partial unique index is the
 * real arbiter, so two simultaneous requests cannot both succeed. A
 * pre-check would be a race.
 *
 * `?include=` returns `{ entry, included }` instead of the bare entry.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, StartTimer);
  const asked = askedToInclude(req);

  const { data, error } = await db
    .from('time_entries')
    .insert({
      id: body.id ?? uuidv7(),
      user_id: userId,
      project_id: body.projectId ?? null,
      task_name: body.taskName,
      started_at: body.startedAt ?? new Date().toISOString(),
      ended_at: null,
      is_billable:
        body.isBillable ?? (await projectBillableDefault(db, body.projectId)),
    })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) {
    if (isTimerConflict(error)) {
      const running = await findRunning(db);
      throw new ApiError(
        'TIMER_ALREADY_RUNNING',
        'A timer is already running. Stop it before starting another.',
        { running },
      );
    }
    throw error;
  }

  const included = await readIncluded(asked, db, userId);
  return NextResponse.json(entryWith(toEntry(data as EntryRow), included), {
    status: 201,
  });
});
