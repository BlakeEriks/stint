import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import {
  RECURRING_EXPENSE_COLUMNS,
  toRecurringExpense,
  type RecurringExpenseRow,
} from '@/lib/rows';
import { expenseWriteError } from '@/lib/expenses';
import { CreateRecurringExpense, uuid } from '@stint/schema';

export const dynamic = 'force-dynamic';

const Query = z.object({ clientId: uuid.optional() });

/** GET /api/v1/recurring-expenses — live ones first, then stopped. */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, Query);

  // Descending puts null — still running — first.
  let query = db
    .from('recurring_expenses')
    .select(RECURRING_EXPENSE_COLUMNS)
    .order('stopped_on', { ascending: false })
    .order('created_at', { ascending: true });
  if (q.clientId) query = query.eq('client_id', q.clientId);

  const { data, error } = await query;
  if (error) throw error;

  return NextResponse.json({
    recurringExpenses: ((data ?? []) as RecurringExpenseRow[]).map(
      toRecurringExpense,
    ),
  });
});

/**
 * POST /api/v1/recurring-expenses
 *
 * Its first month is produced the next time expenses are read, not here: one
 * path produces, so there is one place its rules live.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateRecurringExpense);

  const { data, error } = await db
    .from('recurring_expenses')
    .insert({
      id: body.id,
      user_id: userId,
      client_id: body.clientId,
      project_id: body.projectId ?? null,
      starts_on: body.startsOn,
      description: body.description,
      amount: body.amount,
      note: body.note ?? null,
    })
    .select(RECURRING_EXPENSE_COLUMNS)
    .single();

  if (error) {
    // Replayed request: return what is already stored.
    if (error.code === '23505') {
      const { data: existing } = await db
        .from('recurring_expenses')
        .select(RECURRING_EXPENSE_COLUMNS)
        .eq('id', body.id)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          toRecurringExpense(existing as RecurringExpenseRow),
        );
      }
    }
    throw expenseWriteError(error, 'modified');
  }

  return NextResponse.json(toRecurringExpense(data as RecurringExpenseRow), {
    status: 201,
  });
});
