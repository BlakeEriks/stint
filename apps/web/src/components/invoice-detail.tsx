'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  useOptimisticMutation,
  keys,
  invalidateEntryData,
} from '@stint/client';
import { useMarkPaid } from '@/lib/client/use-mark-paid';
import {
  Ban,
  DollarSign,
  Download,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './confirm-dialog';
import { shortDate, StatusBadge } from './invoice-bits';
import { InvoicePreviewCard } from './invoice-preview-card';
import { MarkPaidDialog } from './mark-paid-dialog';
import { MarkSentDialog } from './mark-sent-dialog';
import { PRICE } from './plan-section';
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
  const router = useRouter();
  const qc = useQueryClient();

  const query = useQuery<Shown>({
    queryKey: keys.invoice(id),
    queryFn: () => api.invoice(id),
    placeholderData: () => fromList(qc, id),
  });

  /* Voiding releases the entries and expenses and deleting a draft frees
     them, so every view of that work moves with the invoice. */
  const refresh = (qc: QueryClient, deleted?: string) =>
    Promise.all([
      /* A deleted draft is not asked for again: it answers 404, "Invoice not
         found", on a page still waiting on the list. */
      qc.invalidateQueries({
        queryKey: keys.invoices(),
        predicate: (q) => deleted === undefined || q.queryKey[1] !== deleted,
      }),
      qc.invalidateQueries({ queryKey: keys.expenses() }),
      invalidateEntryData(qc),
    ]);
  /* Pending, not predicted: issuing assigns the number, and voiding or
     deleting can't be taken back. The page says what was refused. */
  const invoicePress = {
    queryKey: () => keys.invoices(),
    inline: true,
    invalidate: (qc: QueryClient) => refresh(qc),
  };

  const setStatus = useOptimisticMutation({
    ...invoicePress,
    mutationFn: (args: { status: InvoiceStatus }) =>
      api.updateInvoiceStatus(id, args),
  });

  const addWork = useOptimisticMutation({
    ...invoicePress,
    mutationFn: () => api.addDraftWork(id),
  });

  const remove = useOptimisticMutation({
    ...invoicePress,
    invalidate: (qc: QueryClient) => refresh(qc, id),
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => router.push('/invoices'),
  });

  const markPaid = useMarkPaid();

  return (
    <DetailPage back="/invoices" label="Invoices">
      <Listing query={query} missing="That invoice no longer exists.">
        {(data) => (
          <Loaded
            data={data}
            onDownload={() =>
              /* The download is a navigation the page can't await, and it
                 records the dates the client's copy printed, which Mark sent
                 keeps; the server's answer arrives once it has rendered. */
              setTimeout(
                () => qc.invalidateQueries({ queryKey: keys.invoice(id) }),
                1500,
              )
            }
            setStatus={setStatus}
            addWork={addWork}
            remove={remove}
            markPaid={markPaid}
            error={
              remove.error ?? setStatus.error ?? addWork.error ?? markPaid.error
            }
          />
        )}
      </Listing>
    </DetailPage>
  );
}

/** The invoice itself, as the PDF prints it, with what can be done to it. */
function Loaded({
  data: invoice,
  onDownload,
  setStatus,
  addWork,
  remove,
  markPaid,
  error,
}: {
  data: Shown;
  onDownload: () => void;
  setStatus: {
    mutate: (args: { status: InvoiceStatus }) => void;
    isPending: boolean;
    reset: () => void;
    error: unknown;
  };
  addWork: { mutate: () => void; isPending: boolean };
  remove: {
    mutate: () => void;
    isPending: boolean;
    isSuccess: boolean;
    reset: () => void;
    error: unknown;
  };
  markPaid: ReturnType<typeof useMarkPaid>;
  /* Picked ONCE by the caller. Re-evaluating `a ?? b` for the check and again
     for the message could type-check a stale error while printing a different
     one — React Query holds the last error until the next success. */
  error: unknown;
}) {
  const isDraft = invoice.status === 'draft';
  const isVoid = invoice.status === 'void';
  const unrated = invoice.unratedEntries ?? [];
  const refuses = invoice.refuses ?? { download: false, send: false };
  const total = formatCurrency(invoice.total ?? 0, invoice.currency);

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

        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <AskFirst
              title={`Delete ${invoice.invoiceNumber}`}
              description={`The draft and its ${total} total go for good. Its ${entries(invoice.entryCount)} and any expenses on it go back to unbilled.`}
              confirmLabel="Delete draft"
              pendingLabel="Deleting…"
              icon={<Trash2 aria-hidden strokeWidth={1.75} />}
              // Deleted, it stays pending until the list arrives.
              press={{
                ...remove,
                isPending: remove.isPending || remove.isSuccess,
              }}
              onConfirm={() => remove.mutate()}
            />
          ) : null}

          {/* "Edit", not "Edit draft": the row stays on the title's line. */}
          {isDraft ? (
            <Button asChild>
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil aria-hidden strokeWidth={1.75} />
                Edit
              </Link>
            </Button>
          ) : null}

          {!isVoid && !isDraft ? (
            <AskFirst
              title={`Void ${invoice.invoiceNumber}`}
              description={`Its ${total} is no longer owed, and its entries and expenses can be billed again. The number stays, marked void, and voiding can't be undone.`}
              confirmLabel="Void"
              pendingLabel="Voiding…"
              icon={<Ban aria-hidden strokeWidth={1.75} />}
              press={setStatus}
              onConfirm={() => setStatus.mutate({ status: 'void' })}
            />
          ) : null}

          {isDraft ? (
            <MarkSent
              invoice={invoice}
              setStatus={setStatus}
              disabled={refuses.send}
            />
          ) : null}

          {invoice.status === 'sent' ? (
            <Button
              variant="accent"
              onClick={() => {
                // A void error from earlier on this screen must not read as
                // a rejection of the payment date about to be entered.
                setStatus.reset();
                markPaid.show(invoice);
              }}
              disabled={setStatus.isPending || markPaid.isPending(invoice.id)}
            >
              {/* A currency glyph, not a check: the check commits a form. */}
              <DollarSign aria-hidden strokeWidth={1.75} />
              Mark paid
            </Button>
          ) : null}

          {/* Downloading is how an invoice reaches a client: the app sends no
              mail, so it is last, as the primary action. Neither shows until
              the invoice itself answers: the lists it first draws from don't
              say whether its PDF opens. */}
          {invoice.canDownload === true && !refuses.download ? (
            <Button asChild>
              <a
                href={api.invoicePdfUrl(invoice.id, true)}
                onClick={onDownload}
              >
                <Download aria-hidden strokeWidth={1.75} />
                Download PDF
              </a>
            </Button>
          ) : null}
          {invoice.canDownload === false ? (
            <Button asChild>
              <Link href="/settings#plan">
                <Lock aria-hidden strokeWidth={1.75} />
                Subscribe to download
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
      <Notices
        invoice={invoice}
        unrated={unrated}
        addWork={addWork}
        error={error}
      />

      <InvoicePreviewCard
        heading={false}
        preview={{
          ...invoice,
          entryCount: undefined,
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

      <MarkPaidDialog {...markPaid.dialog} />
    </>
  );
}

const entries = (n: number | null | undefined) =>
  `${n ?? 0} entr${n === 1 ? 'y' : 'ies'}`;

/** Delete draft or Void: a quiet red ghost (`.claude/rules/web-ui.md`) whose
    press can't be taken back, so it asks in a dialog that says what goes. */
function AskFirst({
  title,
  description,
  confirmLabel,
  pendingLabel,
  icon,
  press,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  icon: ReactNode;
  press: { isPending: boolean; reset: () => void; error: unknown };
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-danger hover:bg-danger-muted hover:text-danger"
        disabled={press.isPending}
        onClick={() => {
          // A refusal from an earlier press must not read as this one's.
          press.reset();
          setAsking(true);
        }}
      >
        {icon}
        {confirmLabel}
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        pendingLabel={pendingLabel}
        icon={icon}
        tone="danger"
        pending={press.isPending}
        error={press.error}
        onConfirm={onConfirm}
      />
    </>
  );
}

/** Mark sent, and the dialog it asks in. */
function MarkSent({
  invoice,
  setStatus,
  disabled,
}: {
  invoice: Shown;
  setStatus: {
    mutate: (args: { status: InvoiceStatus }) => void;
    isPending: boolean;
    reset: () => void;
    error: unknown;
  };
  disabled: boolean;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          // A refusal from an earlier press must not read as this one's.
          setStatus.reset();
          setAsking(true);
        }}
        disabled={disabled || invoice.entryCount == null}
      >
        <Send aria-hidden strokeWidth={1.75} />
        Mark sent
      </Button>
      {/* Sent, the draft and this go with it. */}
      <MarkSentDialog
        open={asking}
        onOpenChange={setAsking}
        invoice={{
          invoiceNumber: invoice.invoiceNumber,
          entryCount: invoice.entryCount ?? 0,
          total: invoice.total ?? 0,
          currency: invoice.currency,
        }}
        pending={setStatus.isPending}
        error={setStatus.error}
        onConfirm={() => setStatus.mutate({ status: 'sent' })}
      />
    </>
  );
}

function statusHint(status: InvoiceStatus): string | null {
  if (status === 'draft')
    return 'It holds the work it shows. Download it, send it from your own address, then mark it sent.';
  if (status === 'void') return 'Voided. Its entries can be billed again.';
  return null;
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
  const hint = statusHint(invoice.status);
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

/** A draft's warning, under the hint. */
const NOTICE =
  'mt-3 flex flex-col gap-0.5 rounded-md border border-edge-default border-l-[3px] border-l-warning bg-surface-elevated px-3.5 py-3';

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
    <div
      role="status"
      className={`${NOTICE} flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2.5`}
    >
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
    </div>
  );
}

/** The work this draft leaves out because no rate prices it, by name, so
    the user can find each one. */
function Unrated({ entries }: { entries: UnratedEntry[] }) {
  return (
    <div role="status" className={NOTICE}>
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
    </div>
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
    <div role="status" className={NOTICE}>
      <p className="type-body text-strong">Due before it’s issued</p>
      <p className="type-support text-muted">
        {downloaded
          ? `The due date you typed, ${shortDate(due)}, is before today, so it can’t be downloaded again. Send the PDF you downloaded, then mark it sent.`
          : `The due date you typed, ${shortDate(due)}, is before today’s issue date, ${shortDate(issued)}, so it can’t be downloaded or sent. Edit this draft to give it a later due date.`}
      </p>
    </div>
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
