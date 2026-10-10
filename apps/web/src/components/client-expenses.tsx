'use client';

import { useDialog } from '@/lib/client/use-dialog';
import type { Client, Expense } from '@/lib/client/api';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseRow } from './expense-row';

/**
 * A client card's Expenses: recurring ones first, then what waits, then what
 * sits on an unpaid invoice (the route orders them). Nothing at all when the
 * client has none — the card's **+ Expense** is how the first one arrives.
 */
export function ClientExpenses({
  client,
  expenses,
}: {
  client: Client;
  expenses: Expense[];
}) {
  const editing = useDialog<Expense>();
  if (expenses.length === 0) return null;

  return (
    <div className="pt-3">
      <h3 className="pb-1 type-label text-subtle">Expenses</h3>
      <ul className="divide-y divide-edge-grid">
        {expenses.map((expense) => (
          <li key={expense.id}>
            <ExpenseRow
              expense={expense}
              currency={client.currency ?? undefined}
              onOpen={() => editing.show(expense)}
            />
          </li>
        ))}
      </ul>
      <ExpenseDialog
        open={editing.open}
        onOpenChange={editing.onOpenChange}
        client={client}
        expense={editing.subject}
      />
    </div>
  );
}
