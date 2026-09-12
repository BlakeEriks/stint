import { NextResponse } from 'next/server';
import { handle, ApiError, isBilledLock, isTimerConflict } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  ENTRY_COLUMNS,
  toEntry,
  toColumns,
  ENTRY_FIELDS,
  type EntryRow,
} from '@/lib/rows';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const UpdateEntry = z.object({
  projectId: z.uuid().nullable().optional(),
  taskName: z.string().max(500).optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  isBillable: z.boolean().optional(),
  rateOverride: z.number().nonnegative().nullable().optional(),
});

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('time_entries')
    .select(ENTRY_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Entry not found');

  return NextResponse.json(toEntry(data as EntryRow));
});

/**
 * PATCH /api/v1/entries/:id
 *
 * The billed-entry lock lives in a database trigger, so it holds no matter
 * which path reaches the row. This translates it into the documented 409.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const patch = await parseBody(req, UpdateEntry);

  const update = toColumns(patch, ENTRY_FIELDS);
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  // Setting ended_at to null would resurrect this as a running timer, which
  // the unique index rejects if another is live. Check the ordering here so
  // the error explains itself.
  if (update.started_at || update.ended_at !== undefined) {
    const { data: current } = await db
      .from('time_entries')
      .select('started_at, ended_at')
      .eq('id', id)
      .maybeSingle();
    if (!current) throw new ApiError('ENTRY_NOT_FOUND', 'Entry not found');

    const started = (update.started_at as string) ?? current.started_at;
    const ended =
      update.ended_at !== undefined ? update.ended_at : current.ended_at;
    if (ended != null && new Date(ended as string) <= new Date(started)) {
      throw new ApiError(
        'VALIDATION_FAILED',
        'endedAt must be after startedAt',
        {
          startedAt: started,
          endedAt: ended,
        },
      );
    }
  }

  const { data, error } = await db
    .from('time_entries')
    .update(update)
    .eq('id', id)
    .select(ENTRY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (isBilledLock(error)) {
      throw new ApiError(
        'ENTRY_LOCKED',
        'This entry is billed on an issued invoice and cannot be modified',
      );
    }
    if (isTimerConflict(error)) {
      throw new ApiError(
        'TIMER_ALREADY_RUNNING',
        'Reopening this entry would leave two timers running',
      );
    }
    throw error;
  }
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Entry not found');

  return NextResponse.json(toEntry(data as EntryRow));
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('time_entries')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (isBilledLock(error)) {
      throw new ApiError(
        'ENTRY_LOCKED',
        'This entry is billed on an issued invoice and cannot be deleted',
      );
    }
    throw error;
  }
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Entry not found');

  return new NextResponse(null, { status: 204 });
});
