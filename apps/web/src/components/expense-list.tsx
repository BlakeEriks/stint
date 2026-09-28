'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { formatCurrency, localDateKey, uuidv7 } from '@stint/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, textareaClass } from './field';
import { ClientPicker } from './client-picker';
import { ProjectPicker } from './project-picker';
import { StatusBadge, shortDate } from './invoice-bits';
import { Listing, Panel } from './page';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  api,
  ApiError,
  type Client,
  type Expense,
  type RecurringExpense,
} from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';

/**
 * Costs a client reimburses, waiting for an invoice.
 *
 * Recorded the day they are paid, not at month end: a reimbursement nobody
 * remembers at invoice time is money never asked for. Each one waits here
 * until the next invoice for its client takes it.
 */
export function ExpenseList() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [showBilled, setShowBilled] = useState(false);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [editingMonthly, setEditingMonthly] = useState<
    RecurringExpense | 'new' | null
  >(null);

  const query = useQuery({
    queryKey: [...keys.expenses(), { clientId, showBilled }],
    queryFn: () =>
      api.expenses({
        tz,
        ...(clientId ? { clientId } : {}),
        status: showBilled ? 'all' : 'unbilled',
      }),
    select: (r) => r.expenses,
  });
  const { data: clientData } = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });
  const clients = clientData?.clients ?? [];
  const byId = new Map(clients.map((c) => [c.id, c]));

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.expenses() }),
  });

  const monthly = useQuery({
    queryKey: keys.recurringExpenses(),
    queryFn: () => api.recurringExpenses(),
    select: (r) =>
      r.recurringExpenses.filter((m) => !clientId || m.clientId === clientId),
  });

  /* Stopping produces anything already due first, so the list of waiting
     expenses can grow when a recurrence stops. */
  const stop = useMutation({
    mutationFn: (id: string) =>
      api.updateRecurringExpense(id, { stop: true, tz }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.recurringExpenses() });
      queryClient.invalidateQueries({ queryKey: keys.expenses() });
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <ClientPicker
              id="expense-filter"
              clients={clients.filter((c) => !c.archivedAt)}
              value={clientId}
              onChange={setClientId}
              placeholder="All clients"
              label="Filter by client"
            />
          </div>
          <label className="flex items-center gap-2 type-support text-muted">
            <input
              type="checkbox"
              checked={showBilled}
              onChange={(e) => setShowBilled(e.target.checked)}
            />
            Show billed
          </label>
        </div>
        <Button
          type="button"
          variant="default"
          onClick={() => setEditing('new')}
        >
          <Plus aria-hidden strokeWidth={2.25} />
          Add expense
        </Button>
      </div>

      <Panel>
        <Listing
          query={query}
          empty={
            clientId
              ? 'Nothing waiting for this client.'
              : 'Nothing waiting to be billed. Add a cost a client reimburses.'
          }
        >
          {(rows) => (
            <ul className="divide-y divide-edge-subtle">
              {rows.map((expense) => (
                <li key={expense.id}>
                  <Row
                    expense={expense}
                    client={byId.get(expense.clientId)}
                    onEdit={() => setEditing(expense)}
                    onDelete={() => remove.mutate(expense.id)}
                    busy={remove.isPending && remove.variables === expense.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </Listing>
      </Panel>

      {/* A cost that comes every month is set up once. Each month it adds an
          ordinary expense to the list above, on the first charge's day. */}
      <div className="flex items-center justify-between gap-3 pt-8 pb-3">
        <h2 className="type-region-head text-strong">Monthly</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditingMonthly('new')}
        >
          <Plus aria-hidden strokeWidth={2.25} />
          Add monthly expense
        </Button>
      </div>
      <Panel>
        <Listing
          query={monthly}
          empty="Nothing recurring. A subscription the client reimburses can be set up once."
        >
          {(rows) => (
            <ul className="divide-y divide-edge-subtle">
              {rows.map((m) => (
                <li key={m.id}>
                  <MonthlyRow
                    recurrence={m}
                    client={byId.get(m.clientId)}
                    onEdit={() => setEditingMonthly(m)}
                    onStop={() => stop.mutate(m.id)}
                    busy={stop.isPending && stop.variables === m.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </Listing>
      </Panel>

      <ExpenseDialog
        open={editingMonthly !== null}
        onOpenChange={(open) => {
          if (!open) setEditingMonthly(null);
        }}
        monthly
        recurrence={
          editingMonthly === 'new' ? undefined : (editingMonthly ?? undefined)
        }
        clients={clients.filter((c) => !c.archivedAt)}
        defaultClientId={clientId}
      />

      <ExpenseDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        expense={editing === 'new' ? undefined : (editing ?? undefined)}
        clients={clients.filter((c) => !c.archivedAt)}
        defaultClientId={clientId}
      />
    </>
  );
}

/** Whether an expense can still change: unbilled, or on a draft. */
function isLocked(expense: Expense) {
  return expense.invoiceStatus !== null && expense.invoiceStatus !== 'draft';
}

function Row({
  expense,
  client,
  onEdit,
  onDelete,
  busy,
}: {
  expense: Expense;
  client?: Client;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const locked = isLocked(expense);
  const currency = client?.currency ?? undefined;

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-24 flex-none type-meta text-subtle">
        {shortDate(expense.spentOn)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-control text-primary">
          {expense.description}
        </span>
        <span className="truncate type-support text-subtle">
          {client?.name ?? 'Unknown client'}
          {expense.recurringExpenseId ? ' · monthly' : ''}
          {expense.invoiceNumber ? ` · ${expense.invoiceNumber}` : ''}
        </span>
      </span>

      {expense.invoiceStatus ? (
        <StatusBadge status={expense.invoiceStatus} />
      ) : null}

      <span className="w-24 flex-none text-right type-duration text-primary">
        {formatCurrency(expense.amount, currency)}
      </span>

      {/* An expense on an issued invoice is what the client was asked to
          reimburse, so nothing here can change it. */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit ${expense.description}`}
        disabled={locked}
        onClick={onEdit}
      >
        <Pencil aria-hidden className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${expense.description}`}
        disabled={locked || busy}
        onClick={onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
      </Button>
    </div>
  );
}

/** The day of the month, as a person says it: 1st, 2nd, 23rd. */
function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

function MonthlyRow({
  recurrence,
  client,
  onEdit,
  onStop,
  busy,
}: {
  recurrence: RecurringExpense;
  client?: Client;
  onEdit: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  /* Stopping is one-way, so it takes a second, explicit click. */
  const [confirming, setConfirming] = useState(false);
  const stopped = recurrence.stoppedOn !== null;
  const day = Number(recurrence.startsOn.slice(8, 10));

  return (
    <div className="flex items-center gap-3 py-3">
      <Repeat aria-hidden className="size-4 flex-none text-subtle" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-control text-primary">
          {recurrence.description}
        </span>
        <span className="truncate type-support text-subtle">
          {client?.name ?? 'Unknown client'} ·{' '}
          {stopped
            ? `stopped ${shortDate(recurrence.stoppedOn)}`
            : `every month on the ${ordinal(day)}`}
        </span>
      </span>

      <span className="w-24 flex-none text-right type-duration text-primary">
        {formatCurrency(recurrence.amount, client?.currency ?? undefined)}
      </span>

      {stopped ? null : confirming ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onStop}
          >
            Stop it
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Keep
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit ${recurrence.description}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Stop ${recurrence.description}`}
            onClick={() => setConfirming(true)}
          >
            Stop
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * Records a new expense, or edits one that is still unbilled or on a draft.
 * Used by the Expenses tab and by the new-invoice screen, where a cost
 * remembered at billing time is added without leaving the page.
 */
export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  monthly = false,
  recurrence,
  clients,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent to record a new one. */
  expense?: Expense;
  /** A monthly recurrence rather than one expense; `recurrence` to edit one. */
  monthly?: boolean;
  recurrence?: RecurringExpense;
  clients: Client[];
  defaultClientId?: string | null;
  onSaved?: () => void;
}) {
  const existing = expense ?? recurrence;
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [spentOn, setSpentOn] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  /* Made once per recording, so a retried save lands on the same row. */
  const [id, setId] = useState('');

  // Reset each time it opens, so a previous expense cannot linger.
  useEffect(() => {
    if (!open) return;
    setClientId(existing?.clientId ?? defaultClientId ?? null);
    setProjectId(existing?.projectId ?? null);
    setSpentOn(
      expense?.spentOn ?? recurrence?.startsOn ?? localDateKey(new Date(), tz),
    );
    setDescription(existing?.description ?? '');
    setAmount(existing ? String(existing.amount) : '');
    setNote(existing?.note ?? '');
    setId(existing?.id ?? uuidv7());
  }, [open, existing, expense, recurrence, defaultClientId]);

  const { data: projectData } = useQuery({
    queryKey: keys.projects({ clientId: clientId ?? undefined }),
    queryFn: () => api.projects({ clientId: clientId ?? undefined }),
    enabled: open && clientId !== null,
  });
  const projects = (projectData?.projects ?? []).filter(
    (p) => p.clientId === clientId && !p.archivedAt,
  );

  const parsed = Number.parseFloat(amount);
  const valid =
    clientId !== null &&
    spentOn !== '' &&
    description.trim() !== '' &&
    Number.isFinite(parsed) &&
    parsed > 0;

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const body = {
        clientId: clientId as string,
        projectId,
        spentOn,
        description: description.trim(),
        amount: Math.round(parsed * 100) / 100,
        note: note.trim() || null,
      };
      if (monthly) {
        const { clientId: owner, spentOn: startsOn, ...fields } = body;
        /* A change reaches only months not yet produced; the client and the
           first charge are fixed once set. */
        return recurrence
          ? api.updateRecurringExpense(recurrence.id, fields)
          : api.createRecurringExpense({
              id,
              ...fields,
              clientId: owner,
              startsOn,
            });
      }
      return expense
        ? api.updateExpense(expense.id, body)
        : api.createExpense({ id, ...body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.expenses() });
      queryClient.invalidateQueries({ queryKey: keys.recurringExpenses() });
      onSaved?.();
      onOpenChange(false);
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
              {monthly
                ? recurrence
                  ? 'Edit monthly expense'
                  : 'Add monthly expense'
                : expense
                  ? 'Edit expense'
                  : 'Add expense'}
            </DialogTitle>
            <DialogDescription>
              {monthly
                ? 'A cost the client reimburses every month. Each month’s waits for their next invoice; a change here reaches only months still to come.'
                : 'A cost the client reimburses. It waits for their next invoice.'}
            </DialogDescription>
          </DialogHeader>

          <Field label="Client" htmlFor="expense-client" required>
            <ClientPicker
              id="expense-client"
              clients={clients}
              value={clientId}
              onChange={(next) => {
                setClientId(next);
                setProjectId(null);
              }}
              placeholder="Choose a client…"
              disabled={recurrence !== undefined}
            />
          </Field>

          {projects.length > 0 ? (
            <Field label="Project" htmlFor="expense-project">
              <ProjectPicker
                id="expense-project"
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                trigger="field"
                canCreate={false}
              />
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-4">
            <Field
              label={monthly ? 'First charge' : 'Date paid'}
              htmlFor="expense-date"
              required
              className="flex-1 basis-40"
            >
              <Input
                id="expense-date"
                type="date"
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
                disabled={recurrence !== undefined}
                required
              />
            </Field>
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
          </div>

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
              {existing
                ? 'Save'
                : monthly
                  ? 'Add monthly expense'
                  : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
