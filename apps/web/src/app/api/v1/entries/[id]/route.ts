import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handle, ApiError, dbCode } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  ENTRY_COLUMNS,
  toEntry,
  toColumns,
  ENTRY_FIELDS,
  type EntryRow,
} from '@/lib/rows';
import { askedToInclude, entryWith, readIncluded } from '@/lib/include';
import { pushTimerChanged } from '@/lib/push';
import { UpdateTimeEntry } from '@stint/schema';
import { markable, refuseUnmarkable } from '@/lib/invoiced-elsewhere';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

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
  const { userId, db } = await requireSession(req);
  const { id } = await ctx.params;
  const patch = await parseBody(req, UpdateTimeEntry);
  const asked = askedToInclude(req);

  const update = toColumns(patch, ENTRY_FIELDS);
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  await checkOrder(db, id, update);

  const marking = patch.invoicedElsewhere === true;
  const q = db.from('time_entries').update(update).eq('id', id);
  const { data, error } = await (marking ? markable(q) : q)
    .select(ENTRY_COLUMNS)
    .maybeSingle();

  if (error) {
    if (dbCode(error) === 'ENTRY_LOCKED') {
      throw new ApiError(
        'ENTRY_LOCKED',
        'This entry is billed on an issued invoice and cannot be modified',
      );
    }
    if (dbCode(error) === 'TIMER_ALREADY_RUNNING') {
      throw new ApiError(
        'TIMER_ALREADY_RUNNING',
        'Reopening this entry would leave two timers running',
      );
    }
    throw error;
  }
  if (!data && marking) await refuseUnmarkable(db, id);
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Entry not found');
  // Running now, or this edit stopped or reopened it.
  if ((data as EntryRow).ended_at === null || 'ended_at' in update) {
    pushTimerChanged(db, userId);
  }

  const included = await readIncluded(asked, db, userId);
  return NextResponse.json(entryWith(toEntry(data as EntryRow), included));
});

/**
 * Setting ended_at to null would resurrect an entry as a running timer, which
 * the unique index rejects if another is live. The ordering is checked here
 * so the error explains itself.
 */
async function checkOrder(
  db: SupabaseClient,
  id: string,
  update: Record<string, unknown>,
) {
  if (!update.started_at && update.ended_at === undefined) return;
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
    throw new ApiError('VALIDATION_FAILED', 'endedAt must be after startedAt', {
      startedAt: started,
      endedAt: ended,
    });
  }
}

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { userId, db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('time_entries')
    .delete()
    .eq('id', id)
    .select('id, ended_at')
    .maybeSingle();

  if (error) {
    if (dbCode(error) === 'ENTRY_LOCKED') {
      throw new ApiError(
        'ENTRY_LOCKED',
        'This entry is billed on an issued invoice and cannot be deleted',
      );
    }
    throw error;
  }
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Entry not found');
  if (data.ended_at === null) pushTimerChanged(db, userId);

  return new NextResponse(null, { status: 204 });
});
