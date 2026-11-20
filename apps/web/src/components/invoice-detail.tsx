'use client';

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { keys } from '@stint/client';
import {
  useInvoiceActions,
  type UseInvoiceActions,
} from '@/lib/client/use-invoice-actions';
import {
  Ban,
  DollarSign,
  Download,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AskFirst } from './confirm-dialog';
import { daysLate, monthDay, periodName, shortDate } from './invoice-bits';
import { Pip } from './home-shell';
import { InvoicePreviewCard } from './invoice-preview-card';
import { MarkPaidDialog } from './mark-paid-dialog';
import { entries, markSentAsk } from './mark-sent-dialog';
import { Notice } from './notice';
import { PRICE } from './plan-section';
import {
  attachedSchedules,
  daysBetweenKeys,
  formatCurrency,
  formatHours,
  localDateKey,
} from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  api,
  ApiError,
  type NewWork,
  type Invoice,
  type InvoiceStatus,
  type InvoiceLineItem,
  type UnratedEntry,
} from '@/lib/client/api';
import { DetailPage, Listing } from './page';

/** An invoice; the lines, and whether its PDF opens, are absent until they
    load. */
type Shown = Invoice & {
  lineItems?: InvoiceLineItem[];
  canDownload?: boolean;
  entryCount?: number | null;
  newWork?: NewWork | null;
  unratedEntries?: UnratedEntry[];
  dueBeforeIssue?: { download: boolean; send: boolean };
  refuses?: { download: boolean; send: boolean };
};

/** What the invoice list already holds about this invoice, so opening it
    draws at once. */
function fromList(qc: QueryClient, id: string): Shown | undefined {
  return qc
    .getQueryData<{ invoices: Invoice[] }>(keys.invoices())
    ?.invoices.find((i) => i.id === id);
}

export function InvoiceDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const query = useQuery<Shown>({
    queryKey: keys.invoice(id),
    queryFn: () => api.invoice(id),
    placeholderData: () => fromList(qc, id),
  });
  const actions = useInvoiceActions(id);

  return (
    <DetailPage back="/invoices" label="Invoices" fills>
      <Listing query={query} missing="That invoice no longer exists.">
        {(data) => <Loaded data={data} actions={actions} />}
      </Listing>
    </DetailPage>
  );
}

/** The invoice itself, as the PDF prints it, with what can be done to it. */
function Loaded({
  data: invoice,
  actions,
}: {
  data: Shown;
  actions: UseInvoiceActions;
}) {
  const unrated = invoice.unratedEntries ?? [];

  return (
    <>
      <header className="flex flex-col gap-x-6 gap-y-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate type-title text-strong">
            {invoice.invoiceNumber}
          </h1>
          {/* Neutral, as the whole header is: the ring takes no client
              color. */}
          <p className="mt-1 flex min-w-0 items-center gap-1.5 type-support">
            <Pip />
            <span className="truncate text-muted">{invoice.billTo.name}</span>
            <span className="flex-none text-subtle">
              · {periodName(invoice.periodStart, invoice.periodEnd)}
            </span>
          </p>
        </div>
        <div className="flex flex-col sm:items-end">
          <p
            className={`type-amount-hero text-strong ${invoice.status === 'void' ? 'line-through' : ''}`}
          >
            {total(invoice)}
          </p>
          <StatusLine invoice={invoice} />
        </div>
      </header>
      <InvoiceActions invoice={invoice} actions={actions} />
      <Notices
        invoice={invoice}
        unrated={unrated}
        addWork={actions.addWork}
        error={actions.lastError}
      />

      <InvoicePreviewCard
        heading={false}
        preview={{
          ...invoice,
          schedules: invoice.supportingDetail,
        }}
        client={invoice.billTo}
        business={invoice.business}
        number={invoice.invoiceNumber}
        issued={invoice.issueDate}
        due={invoice.dueDate ?? ''}
        reference={invoice.reference ?? ''}
        payment={invoice.paymentDetails}
        schedules={
          invoice.supportingDetail
            ? attachedSchedules(invoice.supportingDetail)
            : []
        }
        updating={!invoice.lineItems}
        paymentTerms={invoice.paymentTerms}
        notes={invoice.notes}
      />

      <MarkPaidDialog {...actions.markPaid.dialog} />
    </>
  );
}

type Action = 'delete' | 'edit' | 'download' | 'markSent' | 'void' | 'markPaid';

/** What each status offers, from the quietest to the step it waits on, so
    the primary sits at the right edge, under the amount. */
const BY_STATUS: Record<InvoiceStatus, Action[]> = {
  draft: ['delete', 'edit', 'download', 'markSent'],
  sent: ['void', 'download', 'markPaid'],
  paid: ['void', 'download'],
  void: ['download'],
};

/** Where it stands, by its dates: "Due Oct 12 · Sent Sep 12". Only lateness
    takes a color. */
function StatusLine({ invoice }: { invoice: Shown }) {
  const day = (at: string | null) =>
    at ? monthDay(localDateKey(new Date(at), tz)) : '—';
  const today = localDateKey(new Date(), tz);
  const due = invoice.dueDate;
  const late =
    invoice.status === 'sent' && due && due < today
      ? daysBetweenKeys(due, today)
      : 0;
  const text = late
    ? `${daysLate(late)} · Due ${monthDay(due)}`
    : {
        draft: `Created ${day(invoice.createdAt)}`,
        sent: [due ? `Due ${monthDay(due)}` : '', `Sent ${day(invoice.sentAt)}`]
          .filter(Boolean)
          .join(' · '),
        paid: `Paid ${day(invoice.paidAt)} · Sent ${day(invoice.sentAt)}`,
        void: 'Void. Its entries can be billed again.',
      }[invoice.status];
  return (
    <p className={`type-support ${late ? 'text-danger' : 'text-muted'}`}>
      {text}
    </p>
  );
}

type ActionProps = { invoice: Shown; actions: UseInvoiceActions };

const total = (invoice: Shown) =>
  formatCurrency(invoice.total ?? 0, invoice.currency);

const ACTIONS: Record<Action, (props: ActionProps) => ReactNode> = {
  delete: ({ invoice, actions: { remove } }) => (
    <AskFirst
      title="Delete this draft?"
      description={`Its ${entries(invoice.entryCount ?? 0)} and any expenses go back to unbilled, ready for another invoice. The draft (${total(invoice)}) is deleted. You can’t undo this.`}
      confirmLabel="Delete draft"
      label="Delete"
      pendingLabel="Deleting…"
      icon={<Trash2 aria-hidden strokeWidth={1.75} />}
      tone="danger"
      press={remove}
      onConfirm={() => remove.mutate()}
    />
  ),
  edit: ({ invoice }) => (
    <Button asChild className={ICON_ON_PHONE}>
      <Link href={`/invoices/${invoice.id}/edit`}>
        <Pencil aria-hidden strokeWidth={1.75} />
        <span className="max-sm:sr-only">Edit</span>
      </Link>
    </Button>
  ),
  download: ({ invoice, actions }) => (
    <DownloadAction invoice={invoice} onDownload={actions.download} />
  ),
  markSent: ({ invoice, actions: { setStatus } }) => (
    <AskFirst
      {...markSentAsk({
        invoiceNumber: invoice.invoiceNumber,
        entryCount: invoice.entryCount ?? 0,
        total: invoice.total ?? 0,
        currency: invoice.currency,
      })}
      accent
      press={setStatus}
      disabled={invoice.refuses?.send || invoice.entryCount == null}
      onConfirm={() => setStatus.mutate({ status: 'sent' })}
    />
  ),
  void: ({ invoice, actions: { setStatus } }) => (
    <AskFirst
      title={`Void ${invoice.invoiceNumber}?`}
      description={`${invoice.invoiceNumber} (${total(invoice)}) is no longer owed. Its entries and any expenses go back to unbilled, ready for a new invoice. It stays in your records, marked void, and its number isn’t reused. You can’t undo this.`}
      confirmLabel="Void invoice"
      label="Void"
      pendingLabel="Voiding…"
      icon={<Ban aria-hidden strokeWidth={1.75} />}
      tone="danger"
      press={setStatus}
      onConfirm={() => setStatus.mutate({ status: 'void' })}
    />
  ),
  markPaid: ({ invoice, actions: { setStatus, markPaid } }) => (
    <Button
      variant="accent"
      onClick={() => markPaid.show(invoice)}
      disabled={setStatus.isPending || markPaid.isPending(invoice.id)}
    >
      {/* A currency glyph, not a check: the check commits a form. */}
      <DollarSign aria-hidden strokeWidth={1.75} />
      Mark paid
    </Button>
  ),
};

/* On a phone Edit and Download PDF drop to their icons, so every status's
   row fits on one line; the name stays, read by a screen reader. */
const ICON_ON_PHONE = 'max-sm:size-9 max-sm:has-[>svg]:px-0';

function InvoiceActions(props: ActionProps) {
  return (
    <div className="mt-4 mb-2 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
      {BY_STATUS[props.invoice.status].map((action) => (
        <Fragment key={action}>{ACTIONS[action](props)}</Fragment>
      ))}
    </div>
  );
}

/** Neither shows until the invoice itself answers: the lists it first draws
    from don't say whether its PDF opens. */
function DownloadAction({
  invoice,
  onDownload,
}: {
  invoice: Shown;
  onDownload: () => void;
}) {
  if (invoice.canDownload === false)
    return (
      <Button asChild>
        <Link href="/settings#plan">
          <Lock aria-hidden strokeWidth={1.75} />
          Get the paid plan to download
        </Link>
      </Button>
    );
  if (invoice.canDownload !== true || invoice.refuses?.download) return null;
  return (
    <Button asChild className={ICON_ON_PHONE}>
      <a href={api.invoicePdfUrl(invoice.id, true)} onClick={onDownload}>
        <Download aria-hidden strokeWidth={1.75} />
        <span className="max-sm:sr-only">Download PDF</span>
      </a>
    </Button>
  );
}

/** What holds the invoice, between its actions and the sheet. */
function Notices({
  invoice,
  unrated,
  addWork,
  error,
}: {
  invoice: Shown;
  unrated: UnratedEntry[];
  addWork: { mutate: () => void; isPending: boolean };
  error: unknown;
}) {
  const newWork = invoice.status === 'draft' ? invoice.newWork : null;
  const dueBeforeIssue = invoice.dueBeforeIssue?.download;
  /* Rendered only when it holds one, so a clean invoice leaves the column
     empty and hidden, with no gap under the actions. */
  const holdsOne = newWork || unrated.length > 0 || dueBeforeIssue || error;
  return (
    <div className="flex flex-col gap-1 pb-4 empty:hidden">
      {holdsOne ? (
        <div className="flex flex-col gap-4">
          {newWork ? (
            <NewWorkNotice
              work={newWork}
              currency={invoice.currency}
              addWork={addWork}
            />
          ) : null}
          {unrated.length > 0 ? <Unrated entries={unrated} /> : null}
          {dueBeforeIssue ? (
            <DueBeforeIssue
              issued={invoice.issueDate}
              due={invoice.dueDate!}
              downloaded={!invoice.dueBeforeIssue!.send}
            />
          ) : null}
          <ActionError error={error} />
        </div>
      ) : null}
      {/* The document is the paid tier; the records never are, and saying
          so here keeps the two rules from reading as one. */}
      {invoice.canDownload === false ? (
        <p className="type-support text-muted">
          Downloading the invoice is on the paid plan, {PRICE}. Tracking and
          your records, exporting them included, stay free.
        </p>
      ) : null}
    </div>
  );
}

/** Work dated in the draft's period that it doesn't hold. It joins only when
    the owner adds it (Constitution I), all of it in one press. */
function NewWorkNotice({
  work,
  currency,
  addWork,
}: {
  work: NewWork;
  currency: string;
  addWork: { mutate: () => void; isPending: boolean };
}) {
  const what = [
    work.entries
      ? `${work.entries} new entr${work.entries === 1 ? 'y' : 'ies'}, ${formatHours(work.hours)}h`
      : '',
    work.expenses
      ? `${work.expenses} new expense${work.expenses === 1 ? '' : 's'}`
      : '',
  ]
    .filter(Boolean)
    .join(' and ');
  return (
    <Notice
      title={`${what}, in this period`}
      detail={`Logged since you built it · ${formatCurrency(work.amount, currency)}. They stay off unless you add them.`}
      action={
        <Button onClick={() => addWork.mutate()} disabled={addWork.isPending}>
          {addWork.isPending ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Plus aria-hidden strokeWidth={1.75} />
          )}
          {addWork.isPending ? 'Adding…' : 'Add to draft'}
        </Button>
      }
    />
  );
}

/** The work this draft leaves out because no rate prices it, by name, so
    the user can find each one. */
function Unrated({ entries }: { entries: UnratedEntry[] }) {
  return (
    <Notice
      title={`${entries.length} entr${entries.length === 1 ? 'y has' : 'ies have'} no rate`}
      detail={`This draft leaves ${entries.length === 1 ? 'it' : 'them'} out, and can’t be downloaded or sent until each has a rate. Set one on the entry, project, client, or in settings.`}
    >
      <ul className="mt-1 type-support text-primary">
        {entries.map((e) => (
          <li key={e.id}>
            {e.taskName || 'Untitled'} ·{' '}
            {shortDate(localDateKey(new Date(e.startedAt), tz))}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/** A typed due date today has passed, which a new PDF would print as
    `Net -N`. One already downloaded still sends as it printed; otherwise a
    draft's due date can't be edited, so the fix is a new draft. */
function DueBeforeIssue({
  issued,
  due,
  downloaded,
}: {
  issued: string;
  due: string;
  downloaded: boolean;
}) {
  return (
    <Notice
      title="Due before it’s issued"
      detail={
        downloaded
          ? `The due date you typed, ${shortDate(due)}, is before today, so it can’t be downloaded again. Send the PDF you downloaded, then mark it sent.`
          : `The due date you typed, ${shortDate(due)}, is before today’s issue date, ${shortDate(issued)}, so it can’t be downloaded or sent. Edit this draft to give it a later due date.`
      }
    />
  );
}

/** Whatever went wrong last, in the user's terms. */
function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Notice
      role="alert"
      tone="danger"
      title={
        error instanceof ApiError ? error.message : 'That change was rejected.'
      }
    />
  );
}
