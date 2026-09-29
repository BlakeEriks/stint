'use client';

import { useState } from 'react';
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
  const [editing, setEditing] = useState<Expense | undefined>();
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
              onOpen={() => setEditing(expense)}
            />
          </li>
        ))}
      </ul>
      <ExpenseDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        client={client}
        expense={editing}
      />
    </div>
  );
}
