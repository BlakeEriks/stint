import { NextResponse } from 'next/server';
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

  const included = await readIncluded(asked, db, userId);
  return NextResponse.json(entryWith(toEntry(data as EntryRow), included));
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
    if (dbCode(error) === 'ENTRY_LOCKED') {
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
