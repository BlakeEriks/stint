'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, inputClass } from './field';
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
  buildPaymentDetails,
  formatInvoiceNumber,
  localDateKey,
  resolvePaymentProfile,
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
} from '@/lib/client/api';
import { DetailPage } from './page';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseRow } from './expense-row';
import { InvoicePreviewCard } from './invoice-preview-card';
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

/** How long typing settles before the server is asked again. */
const SETTLE_MS = 400;

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
  dueDate: string;
  /** The PO, contract or SOW. It decides no line, so it never asks the
   *  server again. */
  reference: string;
  groupingMode: GroupingMode;
  /** The one line's text with `summary`. Fresh on every invoice. */
  summaryText: string;
  /** Supporting detail to attach, with `summary` only. */
  schedules: ScheduleKind[];
  charges: Charge[];
  /** Waiting expenses left off this invoice. They keep waiting. */
  excludedExpenseIds: string[];
}

/** Computed on mount, not at import: the default period is "last month". */
const empty = (): Draft => ({
  clientId: '',
  periodStart: defaultStart(),
  periodEnd: defaultEnd(),
  dueDate: '',
  reference: '',
  groupingMode: 'entry',
  summaryText: '',
  schedules: [],
  charges: [],
  excludedExpenseIds: [],
});

/**
 * The charges that are complete enough to bill.
 *
 * A row with a description and no amount is someone mid-thought, not a line —
 * so it is dropped rather than billed at zero, and the same filter runs
 * before the preview and before generation, so what was previewed is what is
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

/** `value` once it has stopped changing for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  const key = JSON.stringify(value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on content, not identity
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return settled;
}

/**
 * The form, and the invoice it makes beside it.
 *
 * The card answers every change: what the form knows at once, what the
 * server computes (the lines) once typing settles. Generating allocates a
 * gapless number, freezes the rates and locks the entries, so it waits until
 * the card is the server's current answer.
 */
export function NewInvoice() {
  const router = useRouter();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>(empty);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const clients =
    useQuery({ queryKey: keys.clients(), queryFn: () => api.clients() }).data
      ?.clients ?? [];
  const client = clients.find((c) => c.id === draft.clientId);
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });
  const profiles =
    useQuery({
      queryKey: keys.paymentProfiles(),
      queryFn: () => api.paymentProfiles(),
    }).data?.paymentProfiles ?? [];

  /* What this invoice can bill of the client's expenses: every recurring one,
     and every one-off paid by the period's end. */
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

  /* Only what decides the lines is sent, so a due date or a tick never asks
     the server again. */
  const billed = {
    clientId: draft.clientId,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    groupingMode: draft.groupingMode,
    summaryText: draft.summaryText,
    tz,
    manualLines: billableCharges(draft.charges),
    excludedExpenseIds: draft.excludedExpenseIds,
  };
  const settled = useSettled(billed, SETTLE_MS);

  /* A query rather than a press: it writes nothing, so an answer that no
     longer matches the form is simply dropped, and the last one stays on
     screen until the next lands. */
  const preview = useQuery({
    queryKey: keys.invoicePreview(settled),
    queryFn: () => api.previewInvoice(settled),
    enabled: settled.clientId !== '',
    placeholderData: keepPreviousData,
  });
  const updating =
    draft.clientId !== '' &&
    (JSON.stringify(billed) !== JSON.stringify(settled) ||
      preview.isFetching ||
      preview.isPlaceholderData);
  const current = draft.clientId !== '' ? preview.data : undefined;

  const issued = localDateKey(new Date(), tz);

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
        ...billed,
        schedules: draft.groupingMode === 'summary' ? draft.schedules : [],
        // The date the card shows, where the user is. The server's fallback
        // is UTC, a day ahead on a US evening.
        issueDate: issued,
        dueDate: draft.dueDate || undefined,
        reference: draft.reference.trim() || undefined,
      }),
    onSuccess: (invoice) => {
      router.push(`/invoices/${invoice.id}`);
    },
  });

  const toggleExpense = (id: string, bill: boolean) =>
    set(
      'excludedExpenseIds',
      bill
        ? draft.excludedExpenseIds.filter((x) => x !== id)
        : [...draft.excludedExpenseIds, id],
    );

  const number = settings
    ? formatInvoiceNumber(
        settings.invoiceNumberPrefix,
        settings.nextInvoiceNumber,
      )
    : '';
  const profile = resolvePaymentProfile(profiles, {
    clientProfileId: client?.paymentProfileId,
    defaultProfileId: profiles.find((p) => p.isDefault)?.id,
  });
  const payment = buildPaymentDetails(profile, { invoiceNumber: number });

  const unrated = current?.unratedEntryIds.length ?? 0;
  const nothingToBill = current !== undefined && current.lineItems.length === 0;
  const noSummaryText =
    draft.groupingMode === 'summary' && draft.summaryText.trim() === '';
  const canGenerate =
    current !== undefined &&
    !updating &&
    !preview.isError &&
    unrated === 0 &&
    !nothingToBill &&
    !noSummaryText &&
    !generate.isPending;

  return (
    <DetailPage back="/invoices" label="Invoices" wide>
      <div className="@container/new">
        {/* The screen's one action stays in reach while the form scrolls
            under it. */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface-primary pt-1 pb-3.5">
          <h1 className="type-title whitespace-nowrap text-strong">
            New invoice
          </h1>
          <Button
            type="button"
            variant="accent"
            onClick={() => generate.mutate()}
            disabled={!canGenerate}
          >
            {generate.isPending ? 'Generating…' : 'Generate invoice'}
          </Button>
        </div>

        <div className="grid gap-x-8 @min-[800px]/new:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] @min-[800px]/new:items-start">
          {/* One list, in the order the invoice reads: who and when, how the
              time is shown, what else is billed, what is attached. */}
          <div className="flex min-w-0 flex-col [&>*]:border-t [&>*]:border-edge-subtle [&>*]:py-5 [&>*:first-child]:border-0 [&>*:first-child]:pt-1">
            <div className="flex flex-col gap-4">
              <Field label="Client" htmlFor="inv-client" required>
                <ClientPicker
                  id="inv-client"
                  clients={clients}
                  value={draft.clientId || null}
                  onChange={(id) => set('clientId', id ?? '')}
                  placeholder="Choose a client…"
                />
              </Field>
              <div className="flex flex-wrap gap-4">
                <DateField
                  id="inv-from"
                  label="From"
                  value={draft.periodStart}
                  onChange={(v) => set('periodStart', v)}
                />
                <DateField
                  id="inv-to"
                  label="To"
                  value={draft.periodEnd}
                  onChange={(v) => set('periodEnd', v)}
                />
                <DateField
                  id="inv-due"
                  label="Due"
                  value={draft.dueDate}
                  onChange={(v) => set('dueDate', v)}
                />
              </div>
              <Field label="Reference" htmlFor="inv-reference">
                <Input
                  id="inv-reference"
                  value={draft.reference}
                  onChange={(e) => set('reference', e.target.value)}
                  placeholder="PO number, contract or SOW"
                  maxLength={200}
                />
              </Field>
            </div>

            <Field label="Show time as" htmlFor="inv-group">
              <GroupingPicker
                value={draft.groupingMode}
                onChange={(mode) => set('groupingMode', mode)}
              />
              {/* Under the picker on a rule of its own, so the text reads as
                  part of this choice rather than a field of the invoice. */}
              {draft.groupingMode === 'summary' ? (
                <div className="mt-1.5 ml-3 border-l-2 border-edge-subtle pl-3">
                  <Field label="Summary line" htmlFor="inv-summary" required>
                    <Input
                      id="inv-summary"
                      value={draft.summaryText}
                      onChange={(e) => set('summaryText', e.target.value)}
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
              <Field label="Expenses">
                <ExpenseRows
                  expenses={waiting}
                  currency={client.currency ?? undefined}
                  excluded={draft.excludedExpenseIds}
                  onToggle={toggleExpense}
                  onAdd={() => setAddingExpense(true)}
                />
              </Field>
            ) : null}

            <Field label="Charges">
              <ChargeRows
                charges={draft.charges}
                onChange={(charges) => set('charges', charges)}
              />
            </Field>

            {/* Only a summary has detail to support: every other grouping
                already breaks the time down on the invoice. */}
            {draft.groupingMode === 'summary' ? (
              // In a div: a fieldset's legend sits on its border, and the band
              // rule is a border.
              <div>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 type-label text-subtle">
                    Attach
                  </legend>
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
              </div>
            ) : null}
          </div>

          {/* Beside the form on a wide panel, held in view while it scrolls;
              after it on a narrow one. */}
          <div className="mt-6 min-w-0 @min-[800px]/new:sticky @min-[800px]/new:top-16 @min-[800px]/new:mt-0 @min-[800px]/new:flex @min-[800px]/new:max-h-[calc(100vh-8rem)] @min-[800px]/new:flex-col">
            <InvoicePreviewCard
              preview={current}
              client={client}
              settings={settings}
              number={number}
              issued={issued}
              due={draft.dueDate}
              reference={draft.reference.trim()}
              payment={payment}
              schedules={
                draft.groupingMode === 'summary' ? draft.schedules : []
              }
              updating={updating}
            >
              {unrated > 0 ? (
                <p role="alert" className="type-support text-warning">
                  {unrated} entr{unrated === 1 ? 'y has' : 'ies have'} no rate.
                  Set a rate on the client, the project, or your defaults before
                  generating.
                </p>
              ) : null}
              {preview.isError || generate.error ? (
                <p role="alert" className="type-support text-danger">
                  {errorText(generate.error ?? preview.error)}
                </p>
              ) : null}
            </InvoicePreviewCard>
          </div>
        </div>
      </div>

      {client ? (
        <ExpenseDialog
          open={addingExpense}
          onOpenChange={setAddingExpense}
          client={client}
          // A new expense changes what would be billed.
          onSaved={() =>
            qc.invalidateQueries({ queryKey: keys.invoicePreview() })
          }
        />
      ) : null}
    </DetailPage>
  );
}

function errorText(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'Could not build this invoice.';
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id} className="flex-[1_1_104px]">
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // A date input keeps an intrinsic width that would wrap the row.
        className="min-w-0"
      />
    </Field>
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
 * The charge editor: rows plus one way to add another. An untouched row costs
 * nothing — `billableCharges` drops anything without both a description and
 * an amount.
 */
function ChargeRows({
  charges,
  onChange,
}: {
  charges: Charge[];
  onChange: (charges: Charge[]) => void;
}) {
  const edit = (key: string, patch: Partial<Charge>) =>
    onChange(charges.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  return (
    <div className="flex flex-col gap-2">
      {charges.map((c, i) => (
        <div key={c.key} className="flex items-center gap-2">
          <Input
            value={c.description}
            onChange={(e) => edit(c.key, { description: e.target.value })}
            placeholder="What is the charge for?"
            aria-label={`Charge ${i + 1} description`}
            className="flex-1"
          />
          <Input
            value={c.amount}
            onChange={(e) => edit(c.key, { amount: e.target.value })}
            placeholder="0.00"
            inputMode="decimal"
            aria-label={`Charge ${i + 1} amount`}
            className="w-28 type-duration text-right"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(charges.filter((x) => x.key !== c.key))}
            aria-label={`Remove charge ${i + 1}`}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange([
              ...charges,
              { key: crypto.randomUUID(), description: '', amount: '' },
            ])
          }
        >
          <Plus className="size-4" />
          Add a charge
        </Button>
      </div>
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
