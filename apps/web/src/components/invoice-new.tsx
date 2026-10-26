'use client';

import { useEffect, useState } from 'react';
import { useDialog } from '@/lib/client/use-dialog';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { shortDate } from './invoice-bits';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  useOptimisticMutation,
  keys,
  invalidateEntryData,
} from '@stint/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, inputClass } from './field';
import { ClientPicker } from './client-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Pencil, Plus } from 'lucide-react';
import {
  addDays,
  BILLING_PERIOD_LABELS,
  buildPaymentDetails,
  defaultInvoicePeriod,
  attachedSchedules,
  formatCurrency,
  formatInvoiceNumber,
  isPeriod,
  localDateKey,
  resolvePaymentProfile,
  SCHEDULE_KINDS,
  SCHEDULE_TITLES,
  type Period,
  type ScheduleKind,
} from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  api,
  ApiError,
  type Client,
  type Expense,
  type GroupingMode,
  type Invoice,
  type InvoicePreview,
  type PaymentProfile,
  type Settings,
} from '@/lib/client/api';
import { DetailPage, Listing } from './page';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseRow } from './expense-row';
import { type Charge, ChargeDialog } from './charge-dialog';
import { PaymentProfileDialog } from './payment-profile-dialog';
import { missingBusiness, SenderNotice } from './business-dialog';
import { ClientDialog } from './client-dialog';
import { summarize } from './payment-profiles';
import { businessOf, InvoicePreviewCard } from './invoice-preview-card';
import { rowButton } from './row-button';

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

/** A charge on this invoice, keyed so the list can say which to edit. */
type DraftCharge = Charge & { key: string };

interface Draft {
  clientId: string;
  /** `null` until the user edits either date, so the period follows the
   *  client's billing schedule. */
  periodStart: string | null;
  periodEnd: string | null;
  /** `null` until the user picks one, so it follows the payment terms the
   *  invoice prints. */
  dueDate: string | null;
  /** The PO, contract or SOW. It decides no line, so it never asks the
   *  server again. */
  reference: string;
  /* These three are `null` until the user sets them, so they follow the
     client's last invoice. */
  groupingMode: GroupingMode | null;
  /** The one line's text with `summary`. */
  summaryText: string | null;
  /** Supporting detail to attach, with `summary` only. */
  schedules: ScheduleKind[] | null;
  charges: DraftCharge[];
  /** Waiting expenses left off this invoice. They keep waiting. */
  excludedExpenseIds: string[];
  /** The payment details picked here; '' prints the client's, else the
   *  default. */
  paymentProfileId: string;
}

const EMPTY: Draft = {
  clientId: '',
  periodStart: null,
  periodEnd: null,
  dueDate: null,
  reference: '',
  groupingMode: null,
  summaryText: null,
  schedules: null,
  charges: [],
  excludedExpenseIds: [],
  paymentProfileId: '',
};

/** The period the user set, else the client's default for `today`. */
function periodOf(
  draft: Draft,
  client: Client | undefined,
  today: string,
): Period {
  const suggested = defaultInvoicePeriod(today, client?.billingSchedule);
  return {
    periodStart: draft.periodStart ?? suggested.periodStart,
    periodEnd: draft.periodEnd ?? suggested.periodEnd,
  };
}

/** A hint, not a block: a first or last invoice can cover part of a
 *  period, and a contract can change. */
function ScheduleHint({
  client,
  periodStart,
  periodEnd,
}: {
  client: Client | undefined;
  periodStart: string;
  periodEnd: string;
}) {
  const schedule = client?.billingSchedule;
  // A cleared date is still being typed, not a period.
  if (!schedule || !periodStart || !periodEnd) return null;
  if (isPeriod(schedule, periodStart, periodEnd)) return null;
  return (
    <p role="status" className="type-support text-warning">
      {client.name} is billed{' '}
      {BILLING_PERIOD_LABELS[schedule.period].toLowerCase()}, and this isn't one
      of its periods.
    </p>
  );
}

/** What a client's last invoice carries into the next: a summary's text and
 *  attachments, so a monthly invoice isn't retyped. */
const carriedFrom = (last: Invoice | undefined) =>
  last?.groupingMode === 'summary'
    ? {
        groupingMode: last.groupingMode,
        summaryText: last.summaryText ?? '',
        schedules: attachedSchedules(last.supportingDetail),
      }
    : { groupingMode: 'entry' as const, summaryText: '', schedules: [] };

/** `key` `'new'` adds the charge; any other replaces the charge it names. */
const putCharge = (
  charges: DraftCharge[],
  key: string | undefined,
  charge: Charge,
): DraftCharge[] =>
  key === 'new'
    ? [...charges, { ...charge, key: crypto.randomUUID() }]
    : charges.map((c) => (c.key === key ? { ...charge, key: c.key } : c));

/** What the draft takes from the client's last invoice until the user sets
 *  its own, and whether that invoice has answered yet. */
function useCarried(draft: Draft) {
  /* Newest first. */
  const lastInvoice = useQuery({
    queryKey: [...keys.invoices(), { clientId: draft.clientId }],
    queryFn: () => api.invoices({ clientId: draft.clientId }),
    enabled: draft.clientId !== '',
    select: (r) => r.invoices.find((i) => i.status !== 'void'),
  });
  const carried = carriedFrom(lastInvoice.data);
  const groupingMode = draft.groupingMode ?? carried.groupingMode;
  return {
    lastPending: lastInvoice.isPending,
    groupingMode,
    summaryText: draft.summaryText ?? carried.summaryText,
    schedules:
      groupingMode === 'summary' ? (draft.schedules ?? carried.schedules) : [],
  };
}

/** What this invoice can bill of the client's expenses: every recurring one,
 *  and every one-off paid by the period's end. */
function useWaitingExpenses(clientId: string, periodEnd: string) {
  const { data } = useQuery({
    queryKey: [...keys.expenses(), { clientId, status: 'unbilled' }],
    queryFn: () => api.expenses({ clientId, status: 'unbilled' }),
    enabled: clientId !== '',
    select: (r) => r.expenses,
  });
  return (data ?? []).filter(
    (e) => e.recurring || (e.spentOn as string) <= periodEnd,
  );
}

/**
 * The server's answer for `billed`, asked once typing settles. `current` is
 * that answer while a client is chosen; `updating` says it may not match the
 * form.
 */
function useLivePreview(
  billed: Parameters<typeof api.previewInvoice>[0],
  chosen: boolean,
) {
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
    chosen &&
    (JSON.stringify(billed) !== JSON.stringify(settled) ||
      preview.isFetching ||
      preview.isPlaceholderData);
  return { preview, current: chosen ? preview.data : undefined, updating };
}

/** The number Generate takes, shown before it does: one that repeats an
    invoice sent before Stint is caught while it can still change. */
function NumberLine({ number }: { number: string }) {
  if (!number) return null;
  return (
    <p className="type-support text-subtle">
      Numbered {number} ·{' '}
      <Link
        href="/settings#numbering"
        className="text-strong underline underline-offset-2"
      >
        Change
      </Link>
    </p>
  );
}

/** The number Generate takes, and the due date the client's payment terms,
 *  else the user's, set from `issued`; both '' until the settings answer. */
function fromSettings(
  settings: Settings | undefined,
  issued: string,
  client: Client | undefined,
) {
  if (!settings) return { number: '', termsDue: '' };
  return {
    number: formatInvoiceNumber(
      settings.invoiceNumberPrefix,
      settings.nextInvoiceNumber,
    ),
    termsDue: addDays(
      issued,
      client?.paymentTermsDays ?? settings.paymentTermsDays,
    ),
  };
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
 * gapless number and creates the draft, so it waits until the card is the
 * server's current answer.
 */
export function NewInvoice() {
  /* The form paints once, its client list, terms and payment profiles in
     place; what a chosen client then loads fills in as it is asked for. The
     back link is the frame, so it stands while they load. */
  const clients = useQuery({
    queryKey: keys.clients(),
    queryFn: () => api.clients(),
  });
  const settings = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });
  const profiles = useQuery({
    queryKey: keys.paymentProfiles(),
    queryFn: () => api.paymentProfiles(),
  });
  return (
    <DetailPage back="/invoices" label="Invoices" workspace fills>
      <Listing query={[clients, settings, profiles]}>{() => <Form />}</Listing>
    </DetailPage>
  );
}

function Form() {
  const router = useRouter();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  /* Read once: a form left open past midnight keeps the dates it showed
     rather than moving them to the next period unseen. */
  const [issued] = useState(() => localDateKey(new Date(), tz));
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
  const noSender = missingBusiness(settings);
  const profiles =
    useQuery({
      queryKey: keys.paymentProfiles(),
      queryFn: () => api.paymentProfiles(),
    }).data?.paymentProfiles ?? [];

  const { lastPending, groupingMode, summaryText, schedules } =
    useCarried(draft);
  const { periodStart, periodEnd } = periodOf(draft, client, issued);
  const waiting = useWaitingExpenses(draft.clientId, periodEnd);
  /* `undefined` adds an expense; an expense, edits it. */
  const expenseDialog = useDialog<Expense | undefined>();
  /* `'new'` adds a charge; a key, edits that one. */
  const chargeDialog = useDialog<string>();
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  /* Only what decides the lines is sent, so a due date or a tick never asks
     the server again. */
  const billed = {
    // No client until the last invoice has answered, so no preview is asked
    // for in a grouping it is about to change.
    clientId: lastPending ? '' : draft.clientId,
    periodStart,
    periodEnd,
    groupingMode,
    summaryText,
    tz,
    manualLines: draft.charges.map(({ description, amount }) => ({
      description,
      amount,
    })),
    excludedExpenseIds: draft.excludedExpenseIds,
  };
  const { preview, current, updating } = useLivePreview(
    billed,
    draft.clientId !== '',
  );

  const { number, termsDue } = fromSettings(settings, issued, client);
  const due = draft.dueDate ?? termsDue;
  const earlyDue = due !== '' && due < issued;

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
        schedules,
        // Only a typed one: otherwise the terms date it from the day it is
        // sent.
        dueDate: draft.dueDate ?? undefined,
        reference: draft.reference.trim() || undefined,
        // The profile the card shows, frozen as it is now.
        paymentProfileId: profile?.id,
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
  const saveCharge = (charge: Charge) =>
    set('charges', putCharge(draft.charges, chargeDialog.subject, charge));
  const removeCharge = () =>
    set(
      'charges',
      draft.charges.filter((c) => c.key !== chargeDialog.subject),
    );
  const addProfile = (p: PaymentProfile) => {
    /* Into the list at once: until the refetch lands, a pick the list
       lacks would fall back to another profile, and Generate would
       freeze that one. */
    qc.setQueryData<{ paymentProfiles: PaymentProfile[] }>(
      keys.paymentProfiles(),
      (d) =>
        d && !d.paymentProfiles.some((x) => x.id === p.id)
          ? { ...d, paymentProfiles: [...d.paymentProfiles, p] }
          : d,
    );
    set('paymentProfileId', p.id);
  };

  const profile =
    profiles.find((p) => p.id === draft.paymentProfileId) ??
    resolvePaymentProfile(profiles, {
      clientProfileId: client?.paymentProfileId,
      defaultProfileId: profiles.find((p) => p.isDefault)?.id,
    });
  const payment = buildPaymentDetails(profile, { invoiceNumber: number });

  /* One open draft per client and date: the server refuses another, so the
     form says which draft holds these dates before Generate is pressed. */
  const openDrafts =
    useQuery({
      queryKey: [...keys.invoices(), 'drafts', draft.clientId],
      queryFn: () =>
        api.invoices({ clientId: draft.clientId, status: 'draft' }),
      enabled: draft.clientId !== '',
    }).data?.invoices ?? [];
  const covering = openDrafts.find(
    (i) =>
      periodStart !== '' &&
      periodEnd !== '' &&
      i.periodStart <= periodEnd &&
      i.periodEnd >= periodStart,
  );

  const { canGenerate, noSummaryText } = generateState({
    covered: covering !== undefined,
    earlyDue,
    preview: current,
    updating,
    failed: preview.isError,
    hasSettings: settings !== undefined,
    hasSender: !noSender,
    generating: generate.isPending,
    groupingMode,
    summaryText,
  });

  return (
    <>
      {/* From `xl`, where the panel has a height of its own, nothing scrolls
          but the two columns: the form and the preview each scroll alone, so
          reading a long page never moves the field being typed in. Below it
          the page is one scroll, and the title row is pinned to keep
          Generate in reach. */}
      <div className="@container/new xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface-primary pt-1 pb-3.5 xl:static">
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

        {/* A fixed form, and the page up to a Letter page's width (816px):
            more would stretch the lines apart, not show more of them, so
            any room past that is margin around the pair. */}
        <div className="grid gap-x-10 @min-[800px]/new:grid-cols-[360px_minmax(0,816px)] @min-[800px]/new:justify-center xl:min-h-0 xl:flex-1 xl:grid-rows-[minmax(0,1fr)]">
          {/* One list, in the order the invoice reads: who and when, how the
              time is shown, what else is billed, what is attached. */}
          {/* A scroller clips its sides too, so its padding is room for a
              focus ring, taken back with a negative margin so the fields
              don't move. */}
          <div className="flex min-w-0 flex-col xl:-mx-1 xl:min-h-0 xl:overflow-y-auto xl:px-1 [&>*]:border-t [&>*]:border-edge-subtle [&>*]:py-5 [&>*:first-child]:border-0 [&>*:first-child]:pt-1">
            {/* First on the form: it is why Generate is disabled. */}
            <SenderNotice settings={settings} />
            <div className="flex flex-col gap-4">
              <Field
                label="Client"
                htmlFor="inv-client"
                required
                hint={
                  client && missingDetails(client) ? (
                    <span className="text-danger">
                      {missingDetails(client)} ·{' '}
                      <button
                        type="button"
                        onClick={() => setClientOpen(true)}
                        className="rounded-sm underline hover:text-strong focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
                      >
                        Edit client
                      </button>
                    </span>
                  ) : undefined
                }
              >
                <ClientPicker
                  id="inv-client"
                  clients={clients}
                  value={draft.clientId || null}
                  // Another client brings its own payment details.
                  onChange={(id) =>
                    setDraft((d) => ({
                      ...d,
                      clientId: id ?? '',
                      paymentProfileId: '',
                    }))
                  }
                  placeholder="Choose a client…"
                />
              </Field>
              <div className="flex flex-wrap gap-4">
                <DateField
                  id="inv-from"
                  label="From"
                  value={periodStart}
                  // Either date pins both, so another client's schedule
                  // cannot move the other end under the user.
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, periodStart: v, periodEnd }))
                  }
                />
                <DateField
                  id="inv-to"
                  label="To"
                  value={periodEnd}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, periodStart, periodEnd: v }))
                  }
                />
                <DateField
                  id="inv-due"
                  label="Due"
                  value={due}
                  onChange={(v) => set('dueDate', v)}
                />
              </div>
              {earlyDue ? (
                <p role="alert" className="type-support text-danger">
                  Due can't be before the issue date.
                </p>
              ) : null}
              <ScheduleHint
                client={client}
                periodStart={periodStart}
                periodEnd={periodEnd}
              />
              {covering && client ? (
                <p role="status" className="type-support text-warning">
                  A draft already covers {shortDate(covering.periodStart)} –{' '}
                  {shortDate(covering.periodEnd)} for {client.name}:{' '}
                  <Link
                    href={`/invoices/${covering.id}`}
                    className="text-strong underline underline-offset-2"
                  >
                    {covering.invoiceNumber}
                  </Link>
                  . Start after {shortDate(covering.periodEnd)}, or open that
                  draft.
                </p>
              ) : null}
              <Field label="Reference" htmlFor="inv-reference">
                <Input
                  id="inv-reference"
                  value={draft.reference}
                  onChange={(e) => set('reference', e.target.value)}
                  placeholder="PO number, contract or SOW"
                  maxLength={200}
                />
              </Field>
              <NumberLine number={number} />
            </div>

            <Field label="Show time as" htmlFor="inv-group">
              <GroupingPicker
                value={groupingMode}
                onChange={(mode) => set('groupingMode', mode)}
              />
              {groupingMode === 'summary' ? (
                <SummaryLineField
                  value={summaryText}
                  missing={noSummaryText}
                  onChange={(v) => set('summaryText', v)}
                />
              ) : null}
            </Field>

            {client ? (
              <Field label="Expenses">
                <ExpenseRows
                  expenses={waiting}
                  currency={client.currency ?? undefined}
                  excluded={draft.excludedExpenseIds}
                  onToggle={toggleExpense}
                  onOpen={expenseDialog.show}
                  onAdd={() => expenseDialog.show(undefined)}
                />
              </Field>
            ) : null}

            <Field label="Charges">
              <ChargeRows
                charges={draft.charges}
                currency={client?.currency ?? undefined}
                onOpen={chargeDialog.show}
                onAdd={() => chargeDialog.show('new')}
              />
            </Field>

            <Field label="Payment details" htmlFor="inv-payment">
              <PaymentPicker
                profiles={profiles}
                value={profile}
                onChange={(id) => set('paymentProfileId', id)}
                onNew={() => setNewProfileOpen(true)}
              />
            </Field>

            {/* Only a summary has detail to support: every other grouping
                already breaks the time down on the invoice. */}
            {groupingMode === 'summary' ? (
              <ScheduleChecklist
                value={schedules}
                onChange={(v) => set('schedules', v)}
              />
            ) : null}
          </div>

          {/* Beside the form on a wide panel, after it on a narrow one. From
              `xl` its caption stays put and the card scrolls under it. */}
          <div className="mt-6 min-w-0 @min-[800px]/new:mt-0 xl:flex xl:min-h-0 xl:flex-col">
            <InvoicePreviewCard
              noSender={noSender}
              preview={current}
              client={client}
              business={businessOf(settings)}
              settings={settings}
              number={number}
              issued={issued}
              due={due}
              reference={draft.reference.trim()}
              payment={payment}
              schedules={schedules}
              updating={updating}
            >
              <PreviewNotices
                preview={current}
                error={generate.error ?? preview.error}
              />
            </InvoicePreviewCard>
          </div>
        </div>
      </div>

      {client ? (
        <ExpenseDialog
          open={expenseDialog.open}
          onOpenChange={expenseDialog.onOpenChange}
          client={client}
          expense={expenseDialog.subject}
          // A new or changed expense changes what would be billed; a new one
          // is ticked, since nothing excludes it.
          onSaved={() =>
            qc.invalidateQueries({ queryKey: keys.invoicePreview() })
          }
        />
      ) : null}
      <ChargeDialog
        open={chargeDialog.open}
        onOpenChange={chargeDialog.onOpenChange}
        charge={draft.charges.find((c) => c.key === chargeDialog.subject)}
        onSave={saveCharge}
        onRemove={chargeDialog.subject !== 'new' ? removeCharge : undefined}
      />
      {/* No Archive: the draft would keep a client the picker has dropped. */}
      <ClientDialog
        open={clientOpen}
        onOpenChange={setClientOpen}
        client={client}
        archivable={false}
      />
      <PaymentProfileDialog
        open={newProfileOpen}
        onOpenChange={setNewProfileOpen}
        onSaved={addProfile}
      />
    </>
  );
}

/** What Bill to will lack, said; null when it has both. */
function missingDetails(client: Pick<Client, 'address' | 'email'>) {
  if (client.address && client.email) return null;
  if (client.address) return 'No email';
  if (client.email) return 'No address';
  return 'No address or email';
}

/**
 * Whether Generate can be pressed. Generating freezes what the card shows, so
 * it waits for a current, complete answer from the server.
 */
function generateState(s: {
  /** An open draft for this client holds some of these dates. */
  covered: boolean;
  /** Due is before the issue date, which the server refuses. */
  earlyDue: boolean;
  /** The server's answer for this client; `undefined` before one. */
  preview: Pick<InvoicePreview, 'lineItems' | 'unratedEntryIds'> | undefined;
  /** The form has changed since the answer, or the server is recomputing. */
  updating: boolean;
  failed: boolean;
  /** Due follows the settings' terms; without them it would be sent blank. */
  hasSettings: boolean;
  /** The server refuses an invoice with no sender; the notice says why. */
  hasSender: boolean;
  generating: boolean;
  groupingMode: GroupingMode;
  summaryText: string;
}) {
  const noSummaryText =
    s.groupingMode === 'summary' && s.summaryText.trim() === '';
  const complete =
    s.preview !== undefined &&
    s.preview.lineItems.length > 0 &&
    s.preview.unratedEntryIds.length === 0 &&
    !noSummaryText;
  const canGenerate =
    complete &&
    !s.covered &&
    !s.earlyDue &&
    s.hasSettings &&
    s.hasSender &&
    !s.updating &&
    !s.failed &&
    !s.generating;
  return { canGenerate, noSummaryText };
}

function PreviewNotices({
  preview,
  error,
}: {
  preview: InvoicePreview | undefined;
  error: unknown;
}) {
  const unrated = preview?.unratedEntryIds.length ?? 0;
  const overlapping = preview?.overlappingEntryIds.length ?? 0;
  return (
    <>
      {unrated > 0 ? (
        <p role="alert" className="type-support text-warning">
          {unrated} entr{unrated === 1 ? 'y has' : 'ies have'} no rate. Set a
          rate on the client, the project, or your defaults before generating.
        </p>
      ) : null}
      {/* A warning, not a block: an overlap can be deliberate, and this is
          the last place to see it before it bills. */}
      {overlapping > 0 ? (
        <p role="alert" className="type-support text-warning">
          {overlapping} entr
          {overlapping === 1 ? 'y overlaps' : 'ies overlap'} other time, already
          billed or on this invoice.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-support text-danger">
          {error instanceof ApiError
            ? error.message
            : 'Could not build this invoice.'}
        </p>
      ) : null}
    </>
  );
}

/** The one line's text, under the grouping picker on a rule of its own so it
 *  reads as part of that choice rather than a field of the invoice. */
function SummaryLineField({
  value,
  missing,
  onChange,
}: {
  value: string;
  missing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-1.5 ml-3 border-l-2 border-edge-subtle pl-3">
      <Field
        label="Summary line"
        htmlFor="inv-summary"
        required
        error={missing ? 'Give the summary line its text.' : undefined}
      >
        <Input
          id="inv-summary"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Professional services"
          maxLength={200}
        />
      </Field>
    </div>
  );
}

/** The supporting detail a summary attaches, kept in print order. */
function ScheduleChecklist({
  value,
  onChange,
}: {
  value: ScheduleKind[];
  onChange: (value: ScheduleKind[]) => void;
}) {
  return (
    // In a div: a fieldset's legend sits on its border, and the band rule is
    // a border.
    <div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 type-label text-subtle">Attach</legend>
        {SCHEDULE_KINDS.map((kind) => (
          <label
            key={kind}
            className="flex items-center gap-2 type-control text-primary"
          >
            <input
              type="checkbox"
              checked={value.includes(kind)}
              onChange={(e) =>
                onChange(
                  SCHEDULE_KINDS.filter((k) =>
                    k === kind ? e.target.checked : value.includes(k),
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
  );
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

/** The bordered list that expenses and charges share. */
const LIST =
  'rounded-md border border-edge-subtle px-1.5 divide-y divide-edge-subtle';

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  // Its edge, hover and all, is the fields' edge.
  return (
    <div className="mt-1">
      <Button type="button" variant="ghost" size="sm" onClick={onClick}>
        <Plus aria-hidden strokeWidth={2.25} />
        {label}
      </Button>
    </div>
  );
}

/**
 * The client's expenses this invoice can bill, each billed unless unticked.
 * Unticking leaves it for a later invoice, never deletes it; the name opens
 * the expense itself.
 */
function ExpenseRows({
  expenses,
  currency,
  excluded,
  onToggle,
  onOpen,
  onAdd,
}: {
  expenses: Expense[];
  currency?: string;
  excluded: string[];
  onToggle: (id: string, bill: boolean) => void;
  onOpen: (expense: Expense) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col">
      {expenses.length > 0 ? (
        <ul className={LIST}>
          {expenses.map((e) => (
            <li key={e.id} className="pl-1.5">
              <ExpenseRow
                expense={e}
                currency={currency}
                onOpen={() => onOpen(e)}
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
      <AddButton label="Add an expense" onClick={onAdd} />
    </div>
  );
}

/** The charges on this invoice, each opening its dialog. */
function ChargeRows({
  charges,
  currency,
  onOpen,
  onAdd,
}: {
  charges: DraftCharge[];
  currency?: string;
  onOpen: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col">
      {charges.length > 0 ? (
        <ul className={LIST}>
          {charges.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => onOpen(c.key)}
                aria-label={`Edit charge ${c.description}`}
                className={`${rowButton} flex w-full items-center gap-3 py-2.5`}
              >
                <span className="min-w-0 flex-1 truncate type-control text-strong">
                  {c.description}
                </span>
                <span className="flex-none type-duration text-strong">
                  {formatCurrency(c.amount, currency)}
                </span>
                <Pencil
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5 flex-none text-subtle group-hover:text-strong"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <AddButton label="Add a charge" onClick={onAdd} />
    </div>
  );
}

/**
 * Which payment details the invoice prints: each profile by name, with its
 * bank and last four beneath so two at one bank tell apart.
 */
function PaymentPicker({
  profiles,
  value,
  onChange,
  onNew,
}: {
  profiles: PaymentProfile[];
  value: PaymentProfile | null;
  onChange: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id="inv-payment"
        aria-label="Payment details"
        className={`${inputClass} flex items-center justify-between gap-2 text-left
                    focus:border-edge-focus focus:ring-[3px] focus:ring-edge-focus`}
      >
        <span className="truncate">{value?.name ?? 'None'}</span>
        <ChevronDown
          aria-hidden
          className="size-4 flex-none text-muted opacity-60"
          strokeWidth={2}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        {profiles.length > 0 ? (
          <>
            <DropdownMenuRadioGroup
              value={value?.id ?? ''}
              onValueChange={onChange}
            >
              {profiles.map((p) => (
                <DropdownMenuRadioItem
                  key={p.id}
                  value={p.id}
                  className="items-start pl-8"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.isDefault ? (
                        <span className="type-badge text-subtle">Default</span>
                      ) : null}
                    </span>
                    <span className="truncate type-support text-subtle">
                      {summarize(p)}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={onNew}>
          <Plus aria-hidden strokeWidth={2.25} />
          New payment details
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * How the lines are rolled up.
 *
 * A menu rather than a `Select`: each mode is a label over its consequence,
 * and the consequence is what the user is choosing between. A native option
 * is one line of text, which has no room for it.
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
