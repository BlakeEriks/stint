import { NextResponse } from 'next/server';
import { handle } from '@/lib/errors';
import { requireSession } from '@/lib/auth';
import { parseBody, parseQuery } from '@/lib/validate';
import { EXPENSE_COLUMNS, type ExpenseRow } from '@/lib/rows';
import { expenseWriteError, withInvoices } from '@/lib/expenses';
import { CreateExpense, ListExpensesQuery } from '@stint/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/expenses — recurring first, then oldest first.
 *
 * `open` is what a client's card lists: recurring, unbilled, and on an
 * invoice not yet paid, so a billed expense stays in view until the money
 * arrives. `unbilled` is what an invoice can take.
 */
export const GET = handle(async (req: Request) => {
  const { db } = await requireSession(req);
  const q = parseQuery(req, ListExpensesQuery);

  let query = db
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .order('recurring', { ascending: false })
    .order('spent_on', { ascending: true })
    .order('created_at', { ascending: true });

  if (q.clientId) query = query.eq('client_id', q.clientId);
  if (q.status === 'unbilled') query = query.is('invoice_id', null);

  const { data, error } = await query;
  if (error) throw error;

  const expenses = await withInvoices(db, (data ?? []) as ExpenseRow[]);
  return NextResponse.json({
    expenses:
      q.status === 'open'
        ? expenses.filter(
            (e) => e.invoiceStatus !== 'paid' && e.invoiceStatus !== 'void',
          )
        : expenses,
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
      recurring: body.recurring,
      spent_on: body.spentOn ?? null,
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
