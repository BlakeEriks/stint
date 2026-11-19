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
import { shortDate, StatusBadge } from './invoice-bits';
import { InvoicePreviewCard } from './invoice-preview-card';
import { MarkPaidDialog } from './mark-paid-dialog';
import { entries, markSentAsk } from './mark-sent-dialog';
import { PRICE } from './plan-section';
import { Notice } from './notice';
import {
  attachedSchedules,
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
      {/* The hint sits under the row, not in it: a long one would push the
          actions below the title. */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate type-title text-strong">
            {invoice.invoiceNumber}
          </h1>
          <StatusBadge status={invoice.status} />
        </div>

        <InvoiceActions invoice={invoice} actions={actions} />
      </header>
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

type Action = 'delete' | 'edit' | 'markSent' | 'void' | 'markPaid';

/** What each status offers, in the row's order, and the line under the
    title. */
const BY_STATUS: Record<
  InvoiceStatus,
  { actions: Action[]; hint: string | null }
> = {
  draft: {
    actions: ['delete', 'edit', 'markSent'],
    hint: 'Download it, send it from your own address, then mark it sent.',
  },
  sent: { actions: ['void', 'markPaid'], hint: null },
  paid: { actions: ['void'], hint: null },
  void: { actions: [], hint: 'Voided. Its entries can be billed again.' },
};

type ActionProps = { invoice: Shown; actions: UseInvoiceActions };

const total = (invoice: Shown) =>
  formatCurrency(invoice.total ?? 0, invoice.currency);

const ACTIONS: Record<Action, (props: ActionProps) => ReactNode> = {
  delete: ({ invoice, actions: { remove } }) => (
    <AskFirst
      title="Delete this draft?"
      description={`Its ${entries(invoice.entryCount ?? 0)} and any expenses go back to unbilled, ready for another invoice. The draft (${total(invoice)}) is deleted. You can’t undo this.`}
      confirmLabel="Delete draft"
      pendingLabel="Deleting…"
      icon={<Trash2 aria-hidden strokeWidth={1.75} />}
      tone="danger"
      press={remove}
      onConfirm={() => remove.mutate()}
    />
  ),
  /* "Edit", not "Edit draft": the row stays on the title's line. */
  edit: ({ invoice }) => (
    <Button asChild>
      <Link href={`/invoices/${invoice.id}/edit`}>
        <Pencil aria-hidden strokeWidth={1.75} />
        Edit
      </Link>
    </Button>
  ),
  markSent: ({ invoice, actions: { setStatus } }) => (
    <AskFirst
      {...markSentAsk({
        invoiceNumber: invoice.invoiceNumber,
        entryCount: invoice.entryCount ?? 0,
        total: invoice.total ?? 0,
        currency: invoice.currency,
      })}
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

/** The row beside the title: the status's actions, then the download. */
function InvoiceActions(props: ActionProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {BY_STATUS[props.invoice.status].actions.map((action) => (
        <Fragment key={action}>{ACTIONS[action](props)}</Fragment>
      ))}
      <DownloadAction
        invoice={props.invoice}
        onDownload={props.actions.download}
      />
    </div>
  );
}

/** Downloading is how an invoice reaches a client: the app sends no mail, so
    it is last, as the primary action. Neither shows until the invoice itself
    answers: the lists it first draws from don't say whether its PDF opens. */
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
    <Button asChild>
      <a href={api.invoicePdfUrl(invoice.id, true)} onClick={onDownload}>
        <Download aria-hidden strokeWidth={1.75} />
        Download PDF
      </a>
    </Button>
  );
}

/** Where the invoice stands, and what holds it, under the title. */
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
  const { hint } = BY_STATUS[invoice.status];
  return (
    <div className="flex flex-col gap-1 pt-1 pb-6">
      {hint ? <p className="type-support text-muted">{hint}</p> : null}
      {invoice.status === 'draft' && invoice.newWork ? (
        <NewWorkNotice
          work={invoice.newWork}
          currency={invoice.currency}
          addWork={addWork}
        />
      ) : null}
      {unrated.length > 0 ? <Unrated entries={unrated} /> : null}
      {invoice.dueBeforeIssue?.download ? (
        <DueBeforeIssue
          issued={invoice.issueDate}
          due={invoice.dueDate!}
          downloaded={!invoice.dueBeforeIssue.send}
        />
      ) : null}
      {/* The document is the paid tier; the records never are, and saying
          so here keeps the two rules from reading as one. */}
      {invoice.canDownload === false ? (
        <p className="type-support text-muted">
          Downloading the invoice is on the paid plan, {PRICE}. Tracking and
          your records, exporting them included, stay free.
        </p>
      ) : null}
      <ActionError error={error} />
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
    <Notice className="mt-3 flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
      <div className="flex flex-col gap-0.5">
        <p className="type-body text-strong">{what}, in this period</p>
        <p className="type-support text-muted">
          Logged since you built it · {formatCurrency(work.amount, currency)}.
          They stay off unless you add them.
        </p>
      </div>
      <Button onClick={() => addWork.mutate()} disabled={addWork.isPending}>
        {addWork.isPending ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <Plus aria-hidden strokeWidth={1.75} />
        )}
        {addWork.isPending ? 'Adding…' : 'Add to draft'}
      </Button>
    </Notice>
  );
}

/** The work this draft leaves out because no rate prices it, by name, so
    the user can find each one. */
function Unrated({ entries }: { entries: UnratedEntry[] }) {
  return (
    <Notice className="mt-3">
      <p className="type-body text-strong">
        {entries.length} entr{entries.length === 1 ? 'y has' : 'ies have'} no
        rate
      </p>
      <p className="type-support text-muted">
        This draft leaves {entries.length === 1 ? 'it' : 'them'} out, and can’t
        be downloaded or sent until each has a rate. Set one on the entry,
        project, client, or in settings.
      </p>
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
    <Notice className="mt-3">
      <p className="type-body text-strong">Due before it’s issued</p>
      <p className="type-support text-muted">
        {downloaded
          ? `The due date you typed, ${shortDate(due)}, is before today, so it can’t be downloaded again. Send the PDF you downloaded, then mark it sent.`
          : `The due date you typed, ${shortDate(due)}, is before today’s issue date, ${shortDate(issued)}, so it can’t be downloaded or sent. Edit this draft to give it a later due date.`}
      </p>
    </Notice>
  );
}

/** Whatever went wrong last, in the user's terms. */
function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="type-support text-danger">
      {error instanceof ApiError ? error.message : 'That change was rejected.'}
    </p>
  );
}
