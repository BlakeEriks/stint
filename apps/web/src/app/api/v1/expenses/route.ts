import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { EXPENSE_COLUMNS, type ExpenseRow } from '@/lib/rows';
import { expenseWriteError, withInvoices } from '@/lib/expenses';
import { produceRecurringExpenses } from '@/lib/invoicing';
import { CreateExpense, ListExpensesQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/** GET /api/v1/expenses — unbilled by default, oldest first. */
export const GET = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const q = parseQuery(req, ListExpensesQuery);

  await produceRecurringExpenses(db, userId, q.tz);

  let query = db
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .order('spent_on', { ascending: true })
    .order('created_at', { ascending: true });

  if (q.clientId) query = query.eq('client_id', q.clientId);
  if (q.status === 'unbilled') query = query.is('invoice_id', null);

  const { data, error } = await query;
  if (error) throw error;

  return NextResponse.json({
    expenses: await withInvoices(db, (data ?? []) as ExpenseRow[]),
  });
});

/**
 * POST /api/v1/expenses
 *
 * The id is client-supplied (UUIDv7), so a retried request returns the
 * expense already stored instead of recording the cost twice.
 */
export const POST = handle(async (req: Request) => {
  const { userId, db } = await requireSession(req);
  const body = await parseBody(req, CreateExpense);

  const { data, error } = await db
    .from('expenses')
    .insert({
      id: body.id,
      user_id: userId,
      client_id: body.clientId,
      project_id: body.projectId ?? null,
      spent_on: body.spentOn,
      description: body.description,
      amount: body.amount,
      note: body.note ?? null,
    })
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await db
        .from('expenses')
        .select(EXPENSE_COLUMNS)
        .eq('id', body.id)
        .maybeSingle();
      if (existing) {
        const [expense] = await withInvoices(db, [existing as ExpenseRow]);
        return NextResponse.json(expense);
      }
    }
    throw expenseWriteError(error, 'modified');
  }

  const [expense] = await withInvoices(db, [data as ExpenseRow]);
  return NextResponse.json(expense, { status: 201 });
});
