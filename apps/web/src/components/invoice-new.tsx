'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Section, inputClass, textareaClass } from './field';
import { ClientPicker } from './client-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Plus, X } from 'lucide-react';
import {
  formatCurrency,
  formatHours,
  SCHEDULE_KINDS,
  SCHEDULE_TITLES,
  type ScheduleKind,
} from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  api,
  ApiError,
  type Expense,
  type GroupingMode,
  type InvoicePreview,
} from '@/lib/client/api';
import { DetailPage } from './page';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseRow } from './expense-row';
import { shortDate } from './invoice-bits';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

const GROUPINGS: { value: GroupingMode; label: string; hint: string }[] = [
  {
    value: 'summary',
    label: 'One summary line',
    hint: 'One line per rate, with your own text.',
  },
  { value: 'entry', label: 'Every entry', hint: 'One line per time entry.' },
  {
    value: 'task',
    label: 'By task',
    hint: 'Entries with the same name and rate are summed.',
  },
  { value: 'project', label: 'By project', hint: 'One line per project.' },
  { value: 'day', label: 'By day', hint: 'One line per day worked.' },
];

/** A charge the user typed: a fee, a deposit, a retainer. */
interface Charge {
  /** Stable across edits, so React does not remount a row being typed in. */
  key: string;
  description: string;
  /** Held as the raw string: '' and '0' are different, and parsing on every
   *  keystroke fights the user over a half-typed '2.'. */
  amount: string;
}

interface Draft {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  groupingMode: GroupingMode;
  /** The one line's text with `summary`. Fresh on every invoice. */
  summaryText: string;
  /** Supporting detail to attach, with `summary` only. */
  schedules: ScheduleKind[];
  notes: string;
  dueDate: string;
  charges: Charge[];
  /** Waiting expenses left off this invoice. They keep waiting. */
  excludedExpenseIds: string[];
}

/** Computed on mount, not at import: the default period is "last month". */
const empty = (): Draft => ({
  clientId: '',
  periodStart: defaultStart(),
  periodEnd: defaultEnd(),
  groupingMode: 'entry',
  summaryText: '',
  schedules: [],
  notes: '',
  dueDate: '',
  charges: [],
  excludedExpenseIds: [],
});

/**
 * The charges that are complete enough to bill.
 *
 * A row with a description and no amount is someone mid-thought, not a line —
 * so it is dropped rather than billed at zero, and the same filter runs
 * before the preview and before generation, so what was approved is what is
 * created.
 */
function billableCharges(charges: Charge[]) {
  return charges
    .map((c) => ({
      description: c.description.trim(),
      amount: Number.parseFloat(c.amount),
    }))
    .filter(
      (c) => c.description !== '' && Number.isFinite(c.amount) && c.amount > 0,
    )
    .map((c) => ({ ...c, amount: Math.round(c.amount * 100) / 100 }));
}

/**
 * Preview, then generate.
 *
 * The preview has no side effects; generating allocates a gapless number,
 * freezes the rates and locks the entries. That asymmetry is the whole
 * reason this is two steps — the irreversible half must never be a surprise.
 */
export function NewInvoice() {
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(empty);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);

  const { data: clientData } = useQuery({
    queryKey: keys.clients(),
    queryFn: () => api.clients(),
  });
  const clients = clientData?.clients ?? [];

  const client = clients.find((c) => c.id === draft.clientId);

  /* What this invoice can bill of the client's expenses, shown before the
     preview because they decide what gets billed: every recurring one, and
     every one-off paid by the period's end. */
  const { data: expenseData } = useQuery({
    queryKey: [
      ...keys.expenses(),
      { clientId: draft.clientId, status: 'unbilled' },
    ],
    queryFn: () =>
      api.expenses({ clientId: draft.clientId, status: 'unbilled' }),
    enabled: draft.clientId !== '',
    select: (r) => r.expenses,
  });
  const waiting = (expenseData ?? []).filter(
    (e) => e.recurring || (e.spentOn as string) <= draft.periodEnd,
  );
  const [addingExpense, setAddingExpense] = useState(false);

  /* Pending: the server computes the lines and assigns the number, so
     there is nothing to predict. Errors show on the page. */
  const runPreview = useOptimisticMutation({
    queryKey: () => ['invoice-preview'],
    inline: true,
    invalidate: () => undefined,
    mutationFn: () =>
      api.previewInvoice({
        clientId: draft.clientId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        groupingMode: draft.groupingMode,
        summaryText: draft.summaryText,
        tz,
        manualLines: billableCharges(draft.charges),
        excludedExpenseIds: draft.excludedExpenseIds,
      }),
    onSuccess: setPreview,
  });

  const generate = useOptimisticMutation({
    queryKey: () => keys.invoices(),
    inline: true,
    // Generation marks the entries and expenses invoiced, so they leave
    // every unbilled view.
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.invoices() }),
        qc.invalidateQueries({ queryKey: keys.expenses() }),
        invalidateEntryData(qc),
      ]),
    mutationFn: () =>
      api.createInvoice({
        clientId: draft.clientId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        groupingMode: draft.groupingMode,
        summaryText: draft.summaryText,
        schedules: draft.groupingMode === 'summary' ? draft.schedules : [],
        tz,
        manualLines: billableCharges(draft.charges),
        excludedExpenseIds: draft.excludedExpenseIds,
        notes: draft.notes.trim() || undefined,
        dueDate: draft.dueDate || undefined,
      }),
    onSuccess: (invoice) => {
      router.push(`/invoices/${invoice.id}`);
    },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* Any change to WHAT WOULD BE BILLED invalidates the approved preview.
     The due date and the notes do not: they decorate the document rather
     than decide its lines. */
  const setBilled = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    set(key, value);
    setPreview(null);
  };

  /* A charge is a line on the invoice, so editing one invalidates an
     approved preview exactly as changing the client does. */
  const setCharges = (next: Charge[]) => setBilled('charges', next);

  const editCharge = (key: string, patch: Partial<Charge>) =>
    setCharges(
      draft.charges.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    );

  const addCharge = () =>
    setCharges([
      ...draft.charges,
      { key: crypto.randomUUID(), description: '', amount: '' },
    ]);

  const removeCharge = (key: string) =>
    setCharges(draft.charges.filter((c) => c.key !== key));

  /* Leaving an expense off, or taking it back, changes what would be billed,
     so it clears an approved preview like any other line. */
  const toggleExpense = (id: string, bill: boolean) =>
    setBilled(
      'excludedExpenseIds',
      bill
        ? draft.excludedExpenseIds.filter((x) => x !== id)
        : [...draft.excludedExpenseIds, id],
    );

  const blocked = (preview?.unratedEntryIds.length ?? 0) > 0;
  const noSummaryText =
    draft.groupingMode === 'summary' && draft.summaryText.trim() === '';
  const nothingToBill = preview !== null && preview.lineItems.length === 0;

  return (
    <DetailPage back="/invoices" label="Invoices">
      <h1 className="mb-6 type-title text-strong">New invoice</h1>

      <div>
        <Section title="What to bill">
          <Field label="Client" htmlFor="inv-client" required>
            <ClientPicker
              id="inv-client"
              clients={clients}
              value={draft.clientId || null}
              onChange={(id) => setBilled('clientId', id ?? '')}
              placeholder="Choose a client…"
            />
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field label="From" htmlFor="inv-from" className="flex-1 basis-40">
              <Input
                id="inv-from"
                type="date"
                value={draft.periodStart}
                onChange={(e) => setBilled('periodStart', e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="inv-to" className="flex-1 basis-40">
              <Input
                id="inv-to"
                type="date"
                value={draft.periodEnd}
                onChange={(e) => setBilled('periodEnd', e.target.value)}
              />
            </Field>
          </div>

          {/* No `hint` on the Field: each mode's hint is in its own menu row,
              where it describes the choice being weighed rather than the one
              already made. */}
          <Field label="Show time as" htmlFor="inv-group">
            <GroupingPicker
              value={draft.groupingMode}
              onChange={(mode) => setBilled('groupingMode', mode)}
            />
            {/* Under the picker on a rule of its own, so the text reads as
                part of this choice rather than a field of the invoice. */}
            {draft.groupingMode === 'summary' ? (
              <div className="mt-1.5 ml-3 border-l-2 border-edge-subtle pl-3">
                <Field label="Summary line" htmlFor="inv-summary" required>
                  <Input
                    id="inv-summary"
                    value={draft.summaryText}
                    onChange={(e) => setBilled('summaryText', e.target.value)}
                    placeholder="Professional services"
                    maxLength={200}
                    aria-invalid={noSummaryText}
                    aria-describedby={
                      noSummaryText ? 'inv-summary-error' : undefined
                    }
                  />
                  {noSummaryText ? (
                    <p
                      id="inv-summary-error"
                      role="alert"
                      className="type-support text-danger"
                    >
                      Give the summary line its text.
                    </p>
                  ) : null}
                </Field>
              </div>
            ) : null}
          </Field>

          {client ? (
            <Field
              label="Expenses"
              hint="Costs this client reimburses: recurring ones, and any paid by the end of the period. Untick one to leave it off this invoice."
            >
              <ExpenseRows
                expenses={waiting}
                currency={client.currency ?? undefined}
                excluded={draft.excludedExpenseIds}
                onToggle={toggleExpense}
                onAdd={() => setAddingExpense(true)}
              />
            </Field>
          ) : null}

          <Field label="Charges" hint="A fixed fee, a deposit, or a retainer.">
            <ChargeRows
              charges={draft.charges}
              onEdit={editCharge}
              onRemove={removeCharge}
              onAdd={addCharge}
            />
          </Field>

          {/* Only a summary has detail to support: every other grouping
              already breaks the time down on the invoice. Ticking changes no
              line, so it leaves an approved preview standing. */}
          {draft.groupingMode === 'summary' ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 type-label text-subtle">Attach</legend>
              {SCHEDULE_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="flex items-center gap-2 type-control text-primary"
                >
                  <input
                    type="checkbox"
                    checked={draft.schedules.includes(kind)}
                    onChange={(e) =>
                      set(
                        'schedules',
                        SCHEDULE_KINDS.filter((k) =>
                          k === kind
                            ? e.target.checked
                            : draft.schedules.includes(k),
                        ),
                      )
                    }
                    className="size-4 flex-none accent-[var(--text-muted)]"
                  />
                  {SCHEDULE_TITLES[kind]}
                </label>
              ))}
            </fieldset>
          ) : null}
        </Section>

        <Section title="Invoice details">
          <Field
            label="Due date"
            htmlFor="inv-due"
            hint="Defaults to your payment terms."
          >
            <Input
              id="inv-due"
              type="date"
              value={draft.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="inv-notes"
            hint="Printed on the invoice."
          >
            <textarea
              id="inv-notes"
              rows={2}
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={textareaClass}
            />
          </Field>

          <div>
            <Button
              type="button"
              variant="default"
              onClick={() => runPreview.mutate()}
              disabled={!draft.clientId || runPreview.isPending}
            >
              {runPreview.isPending ? 'Checking…' : 'Preview'}
            </Button>
          </div>

          {runPreview.error ? (
            <p role="alert" className="type-support text-danger">
              {runPreview.error instanceof ApiError
                ? runPreview.error.message
                : 'Could not build a preview.'}
            </p>
          ) : null}
        </Section>
      </div>

      {/* The output in a card of its own, apart from the inputs above: what
          the invoice will say, and the one press that makes it. */}
      {preview ? (
        <PreviewCard preview={preview}>
          {blocked ? (
            <p role="alert" className="type-support text-warning">
              {preview.unratedEntryIds.length} entr
              {preview.unratedEntryIds.length === 1 ? 'y has' : 'ies have'} no
              rate. Set a rate on the client, the project, or your defaults
              before generating.
            </p>
          ) : null}

          {generate.error ? (
            <p role="alert" className="type-support text-danger">
              {generate.error instanceof ApiError
                ? generate.error.message
                : 'Could not generate this invoice.'}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {/* What this screen exists to do. */}
            <Button
              type="button"
              variant="accent"
              onClick={() => generate.mutate()}
              disabled={
                generate.isPending || blocked || nothingToBill || noSummaryText
              }
            >
              {generate.isPending ? 'Generating…' : 'Generate invoice'}
            </Button>
            <p className="type-support text-subtle">
              Assigns a number and locks these entries. Voiding later keeps the
              number on record.
            </p>
          </div>
        </PreviewCard>
      ) : null}

      {client ? (
        <ExpenseDialog
          open={addingExpense}
          onOpenChange={setAddingExpense}
          client={client}
          // A new expense changes what would be billed.
          onSaved={() => setPreview(null)}
        />
      ) : null}
    </DetailPage>
  );
}

/**
 * The client's expenses this invoice can bill, each billed unless unticked.
 * Unticking leaves it for a later invoice, never deletes it. The rows are the
 * client card's, with the checkbox as their control.
 */
function ExpenseRows({
  expenses,
  currency,
  excluded,
  onToggle,
  onAdd,
}: {
  expenses: Expense[];
  currency?: string;
  excluded: string[];
  onToggle: (id: string, bill: boolean) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col">
      {expenses.length > 0 ? (
        <ul className="divide-y divide-edge-grid">
          {expenses.map((e) => (
            <li key={e.id}>
              <ExpenseRow
                expense={e}
                currency={currency}
                leading={
                  <input
                    type="checkbox"
                    checked={!excluded.includes(e.id)}
                    onChange={(ev) => onToggle(e.id, ev.target.checked)}
                    aria-label={`Bill ${e.description}`}
                    className="size-4 flex-none accent-[var(--text-muted)]"
                  />
                }
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="-mx-2">
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus aria-hidden strokeWidth={2.25} />
          Expense
        </Button>
      </div>
    </div>
  );
}

/**
 * How the lines are rolled up.
 *
 * A menu rather than a `Select`: each mode is a label over its consequence,
 * and the consequence is what the user is actually choosing between. A native
 * option is one line of text, so the hint used to sit under the closed control
 * describing only the mode already picked — the three it is being weighed
 * against were invisible at the moment of choosing.
 */
function GroupingPicker({
  value,
  onChange,
}: {
  value: GroupingMode;
  onChange: (mode: GroupingMode) => void;
}) {
  const selected = GROUPINGS.find((g) => g.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id="inv-group"
        aria-label="Show time as"
        className={`${inputClass} flex items-center justify-between gap-2 text-left
                    focus:border-edge-focus focus:ring-[3px] focus:ring-edge-focus`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          aria-hidden
          className="size-4 flex-none text-muted opacity-60"
          strokeWidth={2}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as GroupingMode)}
        >
          {GROUPINGS.map((g) => (
            <DropdownMenuRadioItem
              key={g.value}
              value={g.value}
              /* `items-start` and a taller row: the check sits with the label
                 line, not centered against two lines of text. */
              className="items-start pl-8"
            >
              <span className="flex flex-col gap-0.5">
                <span>{g.label}</span>
                <span className="type-support text-subtle">{g.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What the invoice would say, in an elevated card of its own below the
 * inputs, so what is typed and what it makes never blur. `children` is the
 * card's foot: the warnings and Generate.
 */
function PreviewCard({
  preview,
  children,
}: {
  preview: InvoicePreview;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 flex flex-col gap-4 rounded-lg border border-edge-subtle bg-surface-elevated px-4 py-4 sm:px-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-section text-strong">Preview</h2>
        <span className="type-support text-subtle">
          {shortDate(preview.periodStart)} – {shortDate(preview.periodEnd)}
        </span>
      </header>
      <PreviewTable preview={preview} />
      {children}
    </section>
  );
}

function PreviewTable({ preview }: { preview: InvoicePreview }) {
  const services = preview.lineItems.filter((li) => li.unit !== 'expense');
  const expenses = preview.lineItems.filter((li) => li.unit === 'expense');

  if (preview.lineItems.length === 0) {
    return (
      <p className="type-support text-subtle">
        Nothing to bill: no billable, un-invoiced time in this period, and no
        expenses or charges. Running timers and non-billable entries never reach
        an invoice.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="type-heading text-strong">
          {`${preview.clientName} · ${preview.entryCount} entr${
            preview.entryCount === 1 ? 'y' : 'ies'
          }`}
        </h3>
        <p className="mt-1 type-support text-muted">
          Nothing has been created yet.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full type-support">
          <thead>
            <tr className="border-b border-edge-subtle text-left">
              <Th>Description</Th>
              <Th align="right">Qty</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {services.map((item, i) => (
              <tr key={i} className="border-b border-edge-subtle last:border-0">
                <td className="py-2 pr-3 text-primary">{item.description}</td>
                <Td>
                  {item.unit === 'fixed' ? '' : formatHours(item.quantity)}
                </Td>
                <Td>
                  {item.unit === 'fixed'
                    ? ''
                    : formatCurrency(item.unitPrice, preview.currency)}
                </Td>
                <Td strong>{formatCurrency(item.amount, preview.currency)}</Td>
              </tr>
            ))}
          </tbody>
          {/* Reimbursements follow the services under their own heading.
              A date where a quantity would be: the day the cost was paid. */}
          {expenses.length > 0 ? (
            <tbody>
              <tr className="border-b border-edge-subtle text-left">
                <th
                  scope="colgroup"
                  colSpan={4}
                  className="pt-4 pb-2 type-label text-subtle"
                >
                  Expenses
                </th>
              </tr>
              {expenses.map((item, i) => (
                <tr
                  key={i}
                  className="border-b border-edge-subtle last:border-0"
                >
                  <td className="py-2 pr-3 text-primary">{item.description}</td>
                  <Td>{shortDate(item.spentOn)}</Td>
                  <Td>{''}</Td>
                  <Td strong>
                    {formatCurrency(item.amount, preview.currency)}
                  </Td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      </div>

      <dl className="ml-auto flex w-full max-w-[16rem] flex-col gap-1 type-support">
        {/* An invoice of expenses alone has no services to subtotal. */}
        {services.length > 0 || expenses.length === 0 ? (
          <Total
            label={expenses.length > 0 ? 'Services' : 'Subtotal'}
            value={formatCurrency(preview.subtotal, preview.currency)}
          />
        ) : null}
        {preview.taxRate > 0 ? (
          <Total
            label={`Tax (${preview.taxRate}%)`}
            value={formatCurrency(preview.taxAmount, preview.currency)}
          />
        ) : null}
        {expenses.length > 0 ? (
          <Total
            label="Expenses"
            value={formatCurrency(preview.expensesSubtotal, preview.currency)}
          />
        ) : null}
        <Total
          label="Total"
          value={formatCurrency(preview.total, preview.currency)}
          strong
        />
      </dl>
    </div>
  );
}

/**
 * The charge editor: rows plus one way to add another.
 *
 * Always shows at least one row, so the affordance is the control itself
 * rather than a button that reveals a control. An untouched row costs
 * nothing — `billableCharges` drops anything without both a description and
 * an amount.
 */
function ChargeRows({
  charges,
  onEdit,
  onRemove,
  onAdd,
}: {
  charges: Charge[];
  onEdit: (key: string, patch: Partial<Charge>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {charges.map((c, i) => (
        <div key={c.key} className="flex items-center gap-2">
          <Input
            value={c.description}
            onChange={(e) => onEdit(c.key, { description: e.target.value })}
            placeholder="What is the charge for?"
            aria-label={`Charge ${i + 1} description`}
            className="flex-1"
          />
          <Input
            value={c.amount}
            onChange={(e) => onEdit(c.key, { amount: e.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            aria-label={`Charge ${i + 1} amount`}
            className="w-28 type-duration text-right"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(c.key)}
            aria-label={`Remove charge ${i + 1}`}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="size-4" />
          Add a charge
        </Button>
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      scope="col"
      className={`pb-2 type-label text-subtle ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`type-duration py-2 pl-3 text-right ${
        strong ? 'text-strong' : 'text-muted'
      }`}
    >
      {children}
    </td>
  );
}

function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong ? 'border-t border-edge-subtle pt-1.5' : ''
      }`}
    >
      <dt className={strong ? 'text-primary' : 'text-muted'}>{label}</dt>
      <dd
        className={`${strong ? 'type-amount text-strong' : 'type-duration text-muted'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Default to last month, the period a contractor most often bills. */
function defaultStart() {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
function defaultEnd() {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 0));
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
