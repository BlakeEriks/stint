'use client';

import { useEffect, useState } from 'react';
import { useDialog } from '@/lib/client/use-dialog';
import { useLeaveGuard } from '@/lib/client/use-leave-guard';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { Field, inputClass } from './field';
import { ClientDialog } from './client-dialog';
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
import { ChevronDown, Plus } from 'lucide-react';
import {
  addDays,
  BILLING_PERIOD_LABELS,
  buildPaymentDetails,
  billingZone,
  defaultInvoicePeriod,
  attachedSchedules,
  formatCurrency,
  formatInvoiceNumber,
  isPeriod,
  localDateKey,
  resolvePaymentProfile,
  type Period,
  type ScheduleKind,
  type SummaryText,
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
import { type Charge, ChargeDialog } from './charge-dialog';
import { PaymentProfileDialog } from './payment-profile-dialog';
import {
  BusinessDialog,
  missingBusiness,
  SenderNotice,
} from './business-dialog';
import { InvoiceDatesDialog } from './invoice-dates-dialog';
import { PeriodPicker } from './invoice-period';
import { ReadyToInvoice } from './invoice-ready';
import { summarize } from './payment-profiles';
import {
  businessOf,
  type CardEdits,
  InvoicePreviewCard,
  SUMMARY_ERROR,
} from './invoice-preview-card';
import { TemplateDialog } from './template-dialog';
import { templateName } from './template-picker';
import { ConfirmDialog } from './confirm-dialog';

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
  /** Printed on this invoice only; blank prints nothing. */
  notes: string;
  /* These four are `null` until the user sets them, so they follow the
     client's last invoice. */
  /** The PO, contract or SOW. It decides no line, so it never asks the
   *  server again. */
  reference: string | null;
  groupingMode: GroupingMode | null;
  /** The one line's text with `summary`. */
  summaryText: string | null;
  /** With `summary`, the lines typed their own text, by rate. */
  summaryTexts: SummaryText[] | null;
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
  reference: null,
  notes: '',
  groupingMode: null,
  summaryText: null,
  summaryTexts: null,
  schedules: null,
  charges: [],
  excludedExpenseIds: [],
  paymentProfileId: '',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (d: string | null): d is string =>
  d !== null &&
  DATE.test(d) &&
  new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);

/**
 * The draft a link opens with: `?client=…&from=…&to=…`, as the Inbox's row
 * for a client ready to invoice sends. A client not in `clients`,
 * or dates that aren't a period, are left out, so the form opens as usual.
 */
export function linkedDraft(
  params: URLSearchParams,
  clients: Pick<Client, 'id'>[],
): Draft {
  const client = params.get('client');
  const from = params.get('from');
  const to = params.get('to');
  const period = isDate(from) && isDate(to) && from <= to;
  return {
    ...EMPTY,
    clientId: clients.some((c) => c.id === client) ? client! : '',
    periodStart: period ? from : null,
    periodEnd: period ? to : null,
  };
}

/** A draft as `GET /invoices/:id` answers it, which an edit opens. */
type Edited = Awaited<ReturnType<typeof api.invoice>>;

/** Payment details compared by content: Postgres stores them as jsonb,
 *  which keeps no key order. */
const canonical = (v: unknown) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort())
      : x,
  );

/** The form as the draft left it. Its payment details are the profile that
 *  renders them still, else '' to keep them as they were frozen. */
function draftOf(inv: Edited, profiles: PaymentProfile[]): Draft {
  const summary = inv.groupingMode === 'summary';
  const frozen = canonical(inv.paymentDetails);
  return {
    clientId: inv.clientId,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    dueDate: inv.choices?.dueDate ?? null,
    reference: inv.reference ?? '',
    notes: inv.notes ?? '',
    groupingMode: inv.groupingMode,
    // Left to carry, as on New invoice, should a summary be picked.
    summaryText: summary ? (inv.summaryText ?? '') : null,
    summaryTexts: summary ? inv.summaryTexts : null,
    schedules: summary ? attachedSchedules(inv.supportingDetail) : null,
    charges: (inv.choices?.manualLines ?? []).map((l) => ({
      ...l,
      key: crypto.randomUUID(),
    })),
    excludedExpenseIds: inv.choices?.excludedExpenseIds ?? [],
    paymentProfileId:
      profiles.find(
        (p) =>
          canonical(
            buildPaymentDetails(p, { invoiceNumber: inv.invoiceNumber }),
          ) === frozen,
      )?.id ?? '',
  };
}

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

/** What a client's last invoice carries into the next, so a monthly invoice
 *  isn't retyped. A first invoice is one summary line: itemizing is the
 *  exception. Its text starts shown in the field, so it is the user's to
 *  change, never filled in at save. */
const carriedFrom = (last: Invoice | undefined) => ({
  groupingMode: last?.groupingMode ?? 'summary',
  summaryText: last?.summaryText ?? 'Contracting services',
  summaryTexts: last?.summaryTexts ?? [],
  schedules: attachedSchedules(last?.supportingDetail ?? null),
  reference: last?.reference ?? '',
});

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
    summaryTexts: draft.summaryTexts ?? carried.summaryTexts,
    reference: draft.reference ?? carried.reference,
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
  /* Keyed by the link: the Inbox stays reachable here, so a row pressed on
     this page changes the address and must open its own draft. */
  const params = useSearchParams();
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
    <DetailPage back="/invoices" label="Invoices" workspace letter>
      <Listing query={[clients, settings, profiles]}>
        {([c]) => (
          <Form
            key={params.toString()}
            initial={linkedDraft(params, c.clients)}
          />
        )}
      </Listing>
    </DetailPage>
  );
}

/** New invoice, opened on a draft: every field but the client, which it
 *  keeps. Saving keeps its number. */
export function EditInvoice({ id }: { id: string }) {
  const invoice = useQuery({
    queryKey: keys.invoice(id),
    queryFn: () => api.invoice(id),
  });
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
    <DetailPage back={`/invoices/${id}`} label="Invoice" workspace letter>
      <Listing
        query={[invoice, clients, settings, profiles]}
        missing="That invoice no longer exists."
      >
        {([inv, , , p]) =>
          inv.status === 'draft' ? (
            <Form editing={inv} initial={draftOf(inv, p.paymentProfiles)} />
          ) : (
            <p className="type-body text-muted">
              {inv.invoiceNumber} is {inv.status}, and only a draft can be
              edited.
            </p>
          )
        }
      </Listing>
    </DetailPage>
  );
}

function Form({
  editing,
  initial = EMPTY,
}: {
  editing?: Edited;
  initial?: Draft;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft>(initial);
  /* Read once: a form left open past midnight keeps the dates it showed
     rather than moving them to the next period unseen. */
  const [opened] = useState(() => new Date());
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
  // Today on the account's billing calendar, as the server dates it.
  const issued = localDateKey(opened, billingZone(settings, tz));
  const profiles =
    useQuery({
      queryKey: keys.paymentProfiles(),
      queryFn: () => api.paymentProfiles(),
    }).data?.paymentProfiles ?? [];

  const {
    lastPending,
    groupingMode,
    summaryText,
    summaryTexts,
    schedules,
    reference,
  } = useCarried(draft);
  const { periodStart, periodEnd } = periodOf(draft, client, issued);
  const waiting = useWaitingExpenses(draft.clientId, periodEnd);
  /* `undefined` adds an expense; an expense, edits it. */
  const expenseDialog = useDialog<Expense | undefined>();
  /* `'new'` adds a charge; a key, edits that one. */
  const chargeDialog = useDialog<string>();
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(false);
  const [editingSender, setEditingSender] = useState(false);
  const [editingDates, setEditingDates] = useState(false);

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
    summaryTexts,
    tz,
    manualLines: draft.charges.map(({ description, amount }) => ({
      description,
      amount,
    })),
    excludedExpenseIds: draft.excludedExpenseIds,
  };
  const { preview, current, updating } = useLivePreview(
    // Priced as itself, so it keeps the expenses it shows.
    { ...billed, draftId: editing?.id },
    draft.clientId !== '',
  );

  const terms = fromSettings(settings, issued, client);
  const number = editing?.invoiceNumber ?? terms.number;
  const due = draft.dueDate ?? terms.termsDue;
  const earlyDue = due !== '' && due < issued;

  const generate = useOptimisticMutation({
    queryKey: () => keys.invoices(),
    inline: true,
    // The draft holds its entries and expenses, so no other draft or
    // preview offers them.
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.invoices() }),
        qc.invalidateQueries({ queryKey: keys.expenses() }),
        invalidateEntryData(qc),
      ]),
    /* `to` is where a press from the leave dialog was going; the form's own
       press opens the draft. */
    mutationFn: (_to?: string) => {
      const choices = {
        ...billed,
        // A blank is a line cleared for a rate the period no longer bills.
        summaryTexts: summaryTexts.filter((t) => t.text.trim() !== ''),
        schedules,
        // Only a typed one: otherwise the terms date it from the day it is
        // sent.
        dueDate: draft.dueDate ?? undefined,
        reference: reference.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        // The profile the card shows, frozen as it is now; none keeps a
        // draft's.
        paymentProfileId: profile?.id,
      };
      return editing
        ? api.updateDraft(editing.id, choices)
        : api.createInvoice(choices);
    },
    onSuccess: (invoice, to) => {
      router.push(to ?? `/invoices/${invoice.id}`);
    },
  });

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
  // Its rate prices the lines; a new or changed expense changes what is
  // billed, and a new one is ticked, since nothing excludes it.
  const reprice = () =>
    qc.invalidateQueries({ queryKey: keys.invoicePreview() });

  const { profile, payment } = paymentOf({
    editing,
    picked: draft.paymentProfileId,
    profiles,
    client,
    number,
  });

  const { canGenerate, noSummaryText, blocked } = generateState({
    hasClient: draft.clientId !== '',
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
  const summary = !lastPending && groupingMode === 'summary';

  // An unchanged Due keeps following the terms.
  const saveDue = (d: string) => d !== due && set('dueDate', d);

  const guard = useLeaveGuard(
    JSON.stringify(draft) !== JSON.stringify(initial),
  );

  return (
    <>
      <LeaveDialog
        leaving={guard.leaving}
        onStay={guard.stay}
        editing={editing}
        blocked={blocked}
        canSave={canGenerate}
        press={generate}
      />
      <div className="@container/new flex flex-col gap-5">
        {/* Pinned, to keep Generate in reach down a long invoice. On a
            phone the title row gives way (`contents`), and what it held is
            a bar pinned to the bottom, over the timer bar: its 52px and the
            0.75rem it floats by. */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface-primary py-1 @max-[560px]/new:contents">
          <h1 className="type-title whitespace-nowrap text-strong">
            {editing ? `Edit ${editing.invoiceNumber}` : 'New invoice'}
          </h1>
          <div className={`flex items-center gap-4 ${PHONE_BAR}`}>
            {client ? <Due preview={current} updating={updating} /> : null}
            <Button
              type="button"
              variant="accent"
              onClick={() => generate.mutate()}
              disabled={!canGenerate}
            >
              {pressLabel(editing !== undefined, generate.isPending)}
            </Button>
          </div>
        </div>

        <Controls
          editing={editing !== undefined}
          clients={clients}
          draft={draft}
          setDraft={setDraft}
          shown={client ? { today: issued, lastPending, groupingMode } : null}
          period={{ periodStart, periodEnd }}
        />

        {client ? (
          <Notices
            settings={settings}
            client={client}
            period={{ periodStart, periodEnd }}
            // Gone the moment From or the client changes, not when the next
            // answer lands.
            earlierWork={
              current?.periodStart === periodStart &&
              current.clientId === draft.clientId
                ? current.earlierWork
                : null
            }
            onInclude={(from) =>
              setDraft((d) => ({ ...d, periodStart: from, periodEnd }))
            }
            noSummaryText={noSummaryText && !lastPending}
            earlyDue={earlyDue}
            preview={current}
            error={generate.error ?? preview.error}
          />
        ) : null}

        {client ? (
          <InvoicePreviewCard
            noSender={noSender}
            preview={current}
            client={client}
            business={businessOf(settings)}
            number={number}
            issued={issued}
            due={due}
            reference={reference.trim()}
            notes={draft.notes.trim()}
            payment={payment}
            schedules={schedules}
            updating={updating}
            footnote={
              editing
                ? 'Saving keeps its number.'
                : 'Generating assigns a number and holds these entries for this draft.'
            }
            edit={cardEdits({
              draft,
              set,
              editing: editing !== undefined,
              open: {
                sender: () => setEditingSender(true),
                dates: () => setEditingDates(true),
                client: () => setEditingClient(true),
                newProfile: () => setNewProfileOpen(true),
              },
              summary: summary
                ? { value: summaryText, texts: summaryTexts }
                : undefined,
              reference,
              waiting,
              chargeDialog,
              expenseDialog,
              profiles,
              profile,
            })}
          >
            <p className="type-support text-subtle">
              Dashed is yours to fill, and prints only once filled.
            </p>
            <TemplateLine settings={settings} />
          </InvoicePreviewCard>
        ) : (
          <ReadyToInvoice clients={clients} />
        )}
      </div>

      {editingSender && settings ? (
        <BusinessDialog onOpenChange={setEditingSender} settings={settings} />
      ) : null}
      {editingDates ? (
        <InvoiceDatesDialog
          onOpenChange={setEditingDates}
          settings={editing ? undefined : settings}
          number={number}
          issued={issued}
          due={due}
          onDue={saveDue}
        />
      ) : null}
      {client ? (
        <>
          <ClientDialog
            open={editingClient}
            onOpenChange={setEditingClient}
            client={client}
            onSaved={reprice}
          />
          <ExpenseDialog
            open={expenseDialog.open}
            onOpenChange={expenseDialog.onOpenChange}
            client={client}
            expense={expenseDialog.subject}
            onSaved={reprice}
          />
        </>
      ) : null}
      <ChargeDialog
        open={chargeDialog.open}
        onOpenChange={chargeDialog.onOpenChange}
        charge={draft.charges.find((c) => c.key === chargeDialog.subject)}
        onSave={saveCharge}
        onRemove={chargeDialog.subject !== 'new' ? removeCharge : undefined}
      />
      <PaymentProfileDialog
        open={newProfileOpen}
        onOpenChange={setNewProfileOpen}
        onSaved={addProfile}
      />
    </>
  );
}

/** What decides the lines, so it leads; the rest is on the page. Period and
    Show time as wait for a client; `shown` is null until there is one. */
function Controls({
  editing,
  clients,
  draft,
  setDraft,
  shown,
  period,
}: {
  editing: boolean;
  clients: Client[];
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  shown: {
    today: string;
    lastPending: boolean;
    groupingMode: GroupingMode;
  } | null;
  period: Period;
}) {
  return (
    <div className="grid gap-4 @min-[560px]/new:grid-cols-3">
      <Field label="Client" htmlFor="inv-client" required>
        {/* A draft keeps its client: another is a new invoice. */}
        <ClientPicker
          id="inv-client"
          disabled={editing}
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
      {shown ? (
        <Field label="Period" htmlFor="inv-period">
          <PeriodPicker
            id="inv-period"
            today={shown.today}
            value={period}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          />
        </Field>
      ) : null}
      {/* Shown once the client's last invoice says its format, so a carried
          grouping never flips in after a default. */}
      {shown && !shown.lastPending ? (
        <Field label="Show time as" htmlFor="inv-group">
          <GroupingPicker
            value={shown.groupingMode}
            onChange={(mode) => setDraft((d) => ({ ...d, groupingMode: mode }))}
          />
        </Field>
      ) : null}
    </div>
  );
}

/** What is said about the invoice but never printed, between the controls
    and the page. */
function Notices({
  settings,
  client,
  period,
  earlierWork,
  onInclude,
  noSummaryText,
  earlyDue,
  preview,
  error,
}: {
  settings: Settings | undefined;
  client: Client;
  period: Period;
  earlierWork: InvoicePreview['earlierWork'];
  onInclude: (from: string) => void;
  noSummaryText: boolean;
  earlyDue: boolean;
  preview: InvoicePreview | undefined;
  error: Error | null;
}) {
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {/* First: it is why Generate is disabled. */}
      <SenderNotice settings={settings} />
      <ScheduleHint client={client} {...period} />
      <EarlierWorkOffer work={earlierWork} onInclude={onInclude} />
      {noSummaryText ? (
        <p id={SUMMARY_ERROR} role="alert" className="type-support text-danger">
          Give the summary line its text.
        </p>
      ) : null}
      {earlyDue ? (
        <p role="alert" className="type-support text-danger">
          Due can't be before the issue date.
        </p>
      ) : null}
      <PreviewNotices preview={preview} error={error} />
    </div>
  );
}

/** What the page edits, each where it prints. */
function cardEdits({
  draft,
  set,
  editing,
  open,
  summary,
  reference,
  waiting,
  chargeDialog,
  expenseDialog,
  profiles,
  profile,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  editing: boolean;
  open: {
    sender: () => void;
    dates: () => void;
    client: () => void;
    newProfile: () => void;
  };
  /** With one summary line: its text, and the lines typed themselves. */
  summary: { value: string; texts: SummaryText[] } | undefined;
  reference: string;
  waiting: Expense[];
  chargeDialog: { show: (key: string) => void };
  expenseDialog: { show: (expense: Expense | undefined) => void };
  profiles: PaymentProfile[];
  profile: PaymentProfile | null;
}): CardEdits {
  const toggleExpense = (id: string, bill: boolean) =>
    set(
      'excludedExpenseIds',
      bill
        ? draft.excludedExpenseIds.filter((x) => x !== id)
        : [...draft.excludedExpenseIds, id],
    );
  return {
    // A draft froze its sender when it was made, so Settings no longer
    // reaches it.
    onBusiness: editing ? undefined : open.sender,
    onDates: open.dates,
    onClient: open.client,
    reference: { value: reference, onChange: (v) => set('reference', v) },
    notes: { value: draft.notes, onChange: (v) => set('notes', v) },
    /* The first line is the text every line prints unless typed itself, so
       typing there also lets its rate follow again. */
    summary: summary && {
      ...summary,
      onChange: (v, rate) => {
        set('summaryText', v);
        set(
          'summaryTexts',
          summary.texts.filter((t) => t.rate !== rate),
        );
      },
      onChangeAt: (rate, v) =>
        set('summaryTexts', [
          ...summary.texts.filter((t) => t.rate !== rate),
          { rate, text: v },
        ]),
    },
    // Only a summary has detail to support: every other grouping already
    // breaks the time down on the invoice.
    schedules: summary && { onChange: (v) => set('schedules', v) },
    charges: {
      list: draft.charges,
      onOpen: chargeDialog.show,
      onAdd: () => chargeDialog.show('new'),
    },
    expenses: {
      waiting,
      excluded: draft.excludedExpenseIds,
      onToggle: toggleExpense,
      onOpen: expenseDialog.show,
      onAdd: () => expenseDialog.show(undefined),
    },
    paymentMenu: (trigger) => (
      <PaymentMenu
        profiles={profiles}
        value={profile}
        onChange={(id) => set('paymentProfileId', id)}
        onNew={open.newProfile}
      >
        {trigger}
      </PaymentMenu>
    ),
  };
}

/** The payment details the page prints, and the profile they come from. A
    draft whose details no profile renders now keeps them until another is
    picked. */
function paymentOf({
  editing,
  picked,
  profiles,
  client,
  number,
}: {
  editing: Edited | undefined;
  picked: string;
  profiles: PaymentProfile[];
  client: Client | undefined;
  number: string;
}) {
  if (editing && picked === '')
    return { profile: null, payment: editing.paymentDetails ?? null };
  const profile =
    profiles.find((p) => p.id === picked) ??
    resolvePaymentProfile(profiles, {
      clientProfileId: client?.paymentProfileId,
      defaultProfileId: profiles.find((p) => p.isDefault)?.id,
    });
  return {
    profile,
    payment: buildPaymentDetails(profile, { invoiceNumber: number }),
  };
}

const PHONE_BAR =
  '@max-[560px]/new:sticky @max-[560px]/new:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] @max-[560px]/new:z-10 @max-[560px]/new:order-last @max-[560px]/new:justify-between @max-[560px]/new:rounded-lg @max-[560px]/new:border @max-[560px]/new:border-edge-subtle @max-[560px]/new:bg-surface-primary @max-[560px]/new:px-3 @max-[560px]/new:py-2.5';

const pressLabel = (editing: boolean, pending: boolean) => {
  if (editing) return pending ? 'Saving…' : 'Save draft';
  return pending ? 'Generating…' : 'Generate invoice';
};

/** What Generate would bill, beside it: the entries and the amount due,
    or Updating while the server recomputes them. */
function Due({
  preview,
  updating,
}: {
  preview: InvoicePreview | undefined;
  updating: boolean;
}) {
  if (!preview && !updating) return null;
  const entries = preview?.entryCount ?? 0;
  return (
    <span className="flex items-baseline gap-3">
      <span className="type-support text-subtle">
        {updating
          ? 'Updating…'
          : `${entries} entr${entries === 1 ? 'y' : 'ies'}`}
      </span>
      {preview ? (
        <span
          className={`type-amount text-strong transition-opacity duration-150 ${updating ? 'opacity-50' : ''}`}
        >
          {formatCurrency(preview.total, preview.currency)}
        </span>
      ) : null}
    </span>
  );
}

/** The account's template, changed in a dialog: it is a setting, not a
    field of this draft. */
function TemplateLine({ settings }: { settings: Settings | undefined }) {
  const [changing, setChanging] = useState(false);
  if (!settings) return null;
  return (
    <p className="type-support text-subtle">
      {templateName(settings.invoiceTemplate)} template ·{' '}
      <button
        type="button"
        className="text-strong underline underline-offset-2"
        aria-label="Change template"
        onClick={() => setChanging(true)}
      >
        Change
      </button>
      {changing ? (
        <TemplateDialog
          onOpenChange={setChanging}
          template={settings.invoiceTemplate}
        />
      ) : null}
    </p>
  );
}

/**
 * Leaving the form with changes asks first. Nothing is saved unasked:
 * a draft takes a number and holds its period's work, so the user decides
 * whether one exists. Save draft is the form's own press, which opens the
 * draft; Discard goes where the link pointed.
 */
function LeaveDialog({
  leaving,
  onStay,
  editing,
  blocked,
  canSave,
  press,
}: {
  leaving: string | null;
  onStay: () => void;
  editing: Edited | undefined;
  blocked: string | null;
  canSave: boolean;
  press: {
    mutate: (to: string) => void;
    reset: () => void;
    isPending: boolean;
    error: unknown;
  };
}) {
  const router = useRouter();
  const { reset } = press;
  // A refusal from an earlier press must not read as this one's.
  useEffect(() => {
    if (leaving !== null) reset();
  }, [leaving, reset]);
  const loses = editing
    ? 'Leaving loses your changes.'
    : 'Leaving loses this invoice. A draft keeps it to finish later: it takes the next number and holds this work until you send or delete it.';
  return (
    <ConfirmDialog
      open={leaving !== null}
      onOpenChange={(open) => {
        if (!open) onStay();
      }}
      title={
        editing
          ? `Save changes to ${editing.invoiceNumber}?`
          : 'Save this invoice as a draft?'
      }
      description={
        blocked ? `${loses} It can't be saved yet: ${blocked}` : loses
      }
      confirmLabel="Save draft"
      pendingLabel="Saving…"
      keepLabel="Keep editing"
      pending={press.isPending}
      disabled={!canSave}
      error={press.error}
      secondary={{
        label: 'Discard',
        onPress: () => {
          if (leaving !== null) router.push(leaving);
        },
      }}
      onConfirm={() => {
        if (leaving !== null) press.mutate(leaving);
      }}
    />
  );
}

/**
 * Whether Generate can be pressed, and why not when the user can fix it.
 * Generating freezes what the card shows, so it waits for a current answer
 * from the server.
 */
function generateState(s: {
  hasClient: boolean;
  /** Due is before the issue date, which the server refuses. */
  earlyDue: boolean;
  /** The server's answer for this client; `undefined` before one. */
  preview: Pick<InvoicePreview, 'unratedEntryIds' | 'lineItems'> | undefined;
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
  /* A blank line the server printed: a rate's own text cleared. One for a
     rate the period no longer bills prints nothing, so it blocks nothing. */
  const noSummaryText =
    s.groupingMode === 'summary' &&
    (s.summaryText.trim() === '' ||
      (s.preview?.lineItems ?? []).some(
        (li) => li.unit === 'hour' && li.description.trim() === '',
      ));
  const blocked = blockedBy({ ...s, noSummaryText });
  const canGenerate =
    blocked === null &&
    s.preview !== undefined &&
    s.hasSettings &&
    !s.updating &&
    !s.generating;
  return { canGenerate, noSummaryText, blocked };
}

/** What the user must fix before the form can be saved, said after "It
 *  can't be saved yet:"; null when only the server's answer is awaited. */
function blockedBy(s: {
  hasClient: boolean;
  hasSender: boolean;
  earlyDue: boolean;
  failed: boolean;
  noSummaryText: boolean;
  preview: Pick<InvoicePreview, 'unratedEntryIds'> | undefined;
}): string | null {
  if (!s.hasClient) return 'choose a client.';
  if (!s.hasSender) return 'add your business name and email.';
  const unrated = s.preview?.unratedEntryIds.length ?? 0;
  if (unrated > 0)
    return `${unrated} entr${unrated === 1 ? 'y has' : 'ies have'} no rate.`;
  if (s.noSummaryText) return 'give the summary line its text.';
  if (s.earlyDue) return "due can't be before the issue date.";
  if (s.failed) return "the preview couldn't be built.";
  return null;
}

const shortDate = (d: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`));

/** Work dated after the client's last invoice and before this period, which
    neither would bill. Include moves From back to it, and nothing is
    included without the press (Constitution I). */
function EarlierWorkOffer({
  work,
  onInclude,
}: {
  work: InvoicePreview['earlierWork'];
  onInclude: (from: string) => void;
}) {
  if (!work) return null;
  const one = work.entryCount === 1;
  const dates =
    work.from === work.to
      ? shortDate(work.from)
      : `${shortDate(work.from)} – ${shortDate(work.to)}`;
  const what = `${work.entryCount} earlier entr${one ? 'y' : 'ies'}, ${dates},`;
  if (work.draft)
    return (
      <p role="status" className="type-support text-warning">
        {what} {one ? 'is' : 'are'} on draft{' '}
        <Link
          href={`/invoices/${work.draft.id}`}
          className="text-strong underline underline-offset-2"
        >
          {work.draft.invoiceNumber}
        </Link>
        . Open that draft to bill {one ? 'it' : 'them'}.
      </p>
    );
  return (
    <p
      role="status"
      className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 type-support"
    >
      <span>
        {what} {one ? "isn't" : "aren't"} on any invoice.
      </span>
      <Button type="button" size="sm" onClick={() => onInclude(work.from)}>
        Include {one ? 'it' : 'them'}
      </Button>
    </p>
  );
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

/**
 * Which payment details the invoice prints, opened from the payment block:
 * each profile by name, with its bank and last four beneath so two at one
 * bank tell apart.
 */
function PaymentMenu({
  profiles,
  value,
  onChange,
  onNew,
  children,
}: {
  profiles: PaymentProfile[];
  value: PaymentProfile | null;
  onChange: (id: string) => void;
  onNew: () => void;
  /** The block, or its add button, that opens the menu. */
  children: React.ReactElement;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
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
