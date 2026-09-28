import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody } from '@/lib/validate';
import {
  EXPENSE_COLUMNS,
  EXPENSE_FIELDS,
  toColumns,
  type ExpenseRow,
} from '@/lib/rows';
import { expenseWriteError, withInvoices } from '@/lib/expenses';
import { UpdateExpense } from '@stint/schema';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/expenses/:id
 *
 * An expense on an issued invoice is locked by a database trigger, so it
 * holds on every path; this translates it into the documented 409.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;
  const patch = await parseBody(req, UpdateExpense);

  const update = toColumns(patch, EXPENSE_FIELDS);
  if (Object.keys(update).length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'No fields to update');
  }

  const { data, error } = await db
    .from('expenses')
    .update(update)
    .eq('id', id)
    .select(EXPENSE_COLUMNS)
    .maybeSingle();

  if (error) throw expenseWriteError(error, 'modified');
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Expense not found');

  const [expense] = await withInvoices(db, [data as ExpenseRow]);
  return NextResponse.json(expense);
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const { db } = await requireSession(req);
  const { id } = await ctx.params;

  const { data, error } = await db
    .from('expenses')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw expenseWriteError(error, 'deleted');
  if (!data) throw new ApiError('ENTRY_NOT_FOUND', 'Expense not found');

  return new NextResponse(null, { status: 204 });
});
