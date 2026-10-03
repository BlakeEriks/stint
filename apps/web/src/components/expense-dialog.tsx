'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { localDateKey, uuidv7 } from '@stint/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/confirm-action';
import { Input } from '@/components/ui/input';
import { Field, textareaClass } from './field';
import { timeZone as tz } from '@/lib/client/use-timer';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { api, ApiError, type Client, type Expense } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';

/**
 * Adds or edits one expense for one client. The client is fixed: the dialog
 * opens from that client's card or from its invoice.
 *
 * Recurring is a checkbox, not a second form. A recurring expense is billed
 * on every invoice to the client, so it has no date; checking the box hides
 * the field.
 */
export function ExpenseDialog({
  open,
  onOpenChange,
  client,
  expense,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  /** Absent to add one. */
  expense?: Expense;
  onSaved?: (expense: Expense) => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [note, setNote] = useState('');
  /* Made once per recording, so a retried save lands on the same row. */
  const [id, setId] = useState('');

  // Reset each time it opens, so a previous expense cannot linger.
  useEffect(() => {
    if (!open) return;
    setDescription(expense?.description ?? '');
    setAmount(expense ? String(expense.amount) : '');
    setSpentOn(expense?.spentOn ?? localDateKey(new Date(), tz));
    setRecurring(expense?.recurring ?? false);
    setNote(expense?.note ?? '');
    setId(expense?.id ?? uuidv7());
  }, [open, expense]);

  const parsed = Number.parseFloat(amount);
  const valid =
    description.trim() !== '' &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    (recurring || spentOn !== '');

  // Validated by the server, so the press shows pending and a refusal stays
  // in the open dialog.
  const save = useOptimisticMutation({
    queryKey: () => keys.expenses(),
    inline: true,
    mutationFn: (): Promise<Expense> => {
      const body = {
        clientId: client.id,
        recurring,
        spentOn: recurring ? null : spentOn,
        description: description.trim(),
        amount: Math.round(parsed * 100) / 100,
        note: note.trim() || null,
      };
      return expense
        ? api.updateExpense(expense.id, body)
        : api.createExpense({ id, ...body });
    },
    onSuccess: (saved) => {
      onSaved?.(saved);
      onOpenChange(false);
    },
  });

  // The row leaves at once; a refusal puts it back and says why.
  const remove = useOptimisticMutation<
    string,
    unknown,
    { expenses: Expense[] }
  >({
    queryKey: () => keys.expenses(),
    mutationFn: (expenseId) =>
      api.deleteExpense(expenseId).catch((e: Error) => {
        throw new Error(
          `Couldn’t delete ${expense?.description}. ${e.message}`,
        );
      }),
    predict: (current, expenseId) =>
      current && {
        ...current,
        expenses: current.expenses.filter((e) => e.id !== expenseId),
      },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>
              {expense ? 'Edit expense' : 'Add expense'}
            </DialogTitle>
            <DialogDescription>
              A cost {client.name} pays back.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Description"
            htmlFor="expense-description"
            hint="Printed on the invoice."
            required
          >
            <Input
              id="expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="What was it for?"
              required
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field
              label="Amount"
              htmlFor="expense-amount"
              required
              className="flex-1 basis-32"
            >
              <Input
                id="expense-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="type-duration text-right"
                required
              />
            </Field>
            {recurring ? null : (
              <Field
                label="Date paid"
                htmlFor="expense-date"
                required
                className="flex-1 basis-40"
              >
                <Input
                  id="expense-date"
                  type="date"
                  value={spentOn}
                  onChange={(e) => setSpentOn(e.target.value)}
                  required
                />
              </Field>
            )}
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              /* Neutral, not the accent: the dialog's one accent is its
                 submit button, and a checked box is state. */
              className="mt-0.5 size-4 accent-[var(--text-muted)]"
            />
            <span className="flex flex-col">
              <span className="type-control text-primary">Recurring</span>
              <span className="type-support text-subtle">
                Billed on every invoice to {client.name} until unchecked.
              </span>
            </span>
          </label>

          <Field
            label="Note"
            htmlFor="expense-note"
            hint="A receipt or order number. Not printed."
          >
            <textarea
              id="expense-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className={textareaClass}
            />
          </Field>

          {save.error ? (
            <p role="alert" className="type-support text-danger">
              {save.error instanceof ApiError
                ? save.error.message
                : 'Could not save this expense.'}
            </p>
          ) : null}

          <DialogFooter>
            {/* At the far end from Save, so it is never hit by habit. */}
            {expense ? (
              <ConfirmAction
                aria-label="Delete expense"
                className="mr-auto"
                label="Delete for good"
                pendingLabel="Deleting…"
                pending={remove.isPending}
                onConfirm={() => {
                  remove.mutate(expense.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 aria-hidden strokeWidth={1.75} />
              </ConfirmAction>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={!valid || save.isPending}
            >
              {save.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : null}
              {expense ? 'Save' : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
