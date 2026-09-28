import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  RECURRING_EXPENSE_COLUMNS,
  RECURRING_EXPENSE_FIELDS,
  toColumns,
  toRecurringExpense,
  type RecurringExpenseRow,
} from '@/lib/rows';
import { expenseWriteError } from '@/lib/expenses';
import { produceRecurringExpenses } from '@/lib/invoicing';
import { localDateKey } from '@stint/core';
import { UpdateRecurringExpense } from '@stint/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/recurring-expenses/:id
 *
 * A change reaches only months not yet produced: each produced expense is
 * its own record by then, edited on its own. `stop` produces anything
 * already due first, so stopping never loses a month that had come.
 *
 * No DELETE. A recurrence is stopped, never deleted — its expenses point at
 * it.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { userId, db } = await requireSession(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, UpdateRecurringExpense);

  const { data: current, error: readError } = await db
    .from('recurring_expenses')
    .select(RECURRING_EXPENSE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) {
    throw new ApiError('ENTRY_NOT_FOUND', 'Recurring expense not found');
  }
  const row = current as RecurringExpenseRow;

  if (row.stopped_on) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'A stopped recurring expense cannot change. Start a new one instead.',
    );
  }
  // The day of the month is anchored on the first charge; moving it after a
  // month has been produced would leave that month on the old day.
  if (body.startsOn !== undefined && row.produced_through) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'The first charge cannot move once a month has been produced. Stop this one and start a new one.',
    );
  }

  const update: Record<string, unknown> = toColumns(
    body,
    RECURRING_EXPENSE_FIELDS,
  );
  if (body.stop) {
    await produceRecurringExpenses(db, userId, body.tz);
    update.stopped_on = localDateKey(new Date(), body.tz);
  }
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  const { data, error } = await db
    .from('recurring_expenses')
    .update(update)
    .eq('id', id)
    .select(RECURRING_EXPENSE_COLUMNS)
    .maybeSingle();

  if (error) throw expenseWriteError(error, 'modified');
  if (!data) {
    throw new ApiError('ENTRY_NOT_FOUND', 'Recurring expense not found');
  }

  return NextResponse.json(toRecurringExpense(data as RecurringExpenseRow));
});
