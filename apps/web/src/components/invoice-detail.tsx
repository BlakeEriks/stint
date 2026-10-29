'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { Ban, DollarSign, Download, Lock, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from './confirm-action';
import { shortDate, StatusBadge } from './invoice-bits';
import { InvoicePreviewCard } from './invoice-preview-card';
import { MarkPaidDialog } from './mark-paid-dialog';
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
  type DraftChange,
  type Invoice,
  type InvoiceStatus,
  type InvoiceLineItem,
  type UnratedEntry,
} from '@/lib/client/api';
import { DetailPage, Listing } from './page';
import { useHydrated } from '@/lib/client/use-hydrated';

/** An invoice; the lines, and whether its PDF opens, are absent until they
    load. */
type Shown = Invoice & {
  lineItems?: (InvoiceLineItem & { isNew?: boolean })[];
  canDownload?: boolean;
  changedSinceDownload?: DraftChange | null;
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
  /* Pending, not predicted: issuing assigns the number, and voiding or
     deleting can't be taken back. The page says what was refused. */
  const invoicePress = {
    queryKey: () => keys.invoices(),
    inline: true,
    invalidate: (qc: QueryClient) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.invoices() }),
        qc.invalidateQueries({ queryKey: keys.expenses() }),
        invalidateEntryData(qc),
      ]),
  };

  const setStatus = useOptimisticMutation({
    ...invoicePress,
    mutationFn: (args: { status: InvoiceStatus }) =>
      api.updateInvoiceStatus(id, args),
  });

  const remove = useOptimisticMutation({
    ...invoicePress,
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => router.push('/invoices'),
  });

  const markPaid = useMarkPaid();
  /* A draft that moved since its PDF was rendered holds Mark sent until the
     client's copy is the one Stint keeps; pressing Download releases it here,
     and the server, which recorded the render, has the last word. */
  const [downloaded, setDownloaded] = useState(false);
  const error = remove.error ?? setStatus.error ?? markPaid.error;

  /* What the server rendered until hydration, as `Listing` does. A list row
     has no lines, so only the invoice itself makes the actions live. */
  const shown = useHydrated() ? query.data : undefined;
  const changed =
    shown?.status === 'draft' && !downloaded
      ? shown.changedSinceDownload
      : null;

  return (
    <DetailPage back="/invoices" label="Invoices">
      {shown !== undefined || query.error == null ? (
        <Header
          invoice={shown}
          ready={shown?.lineItems !== undefined}
          changed={changed}
          onDownload={() => {
            setDownloaded(true);
            /* The download is a navigation the page can't await, and it is
               what records the copy the client gets; the server's answer
               replaces the change once the PDF has rendered. */
            setTimeout(
              () => qc.invalidateQueries({ queryKey: keys.invoice(id) }),
              1500,
            );
          }}
          setStatus={setStatus}
          remove={remove}
          markPaid={markPaid}
        />
      ) : null}
      <Listing query={query} missing="That invoice no longer exists.">
        {(invoice) => (
          <>
            <Notices
              invoice={invoice}
              // A new PDF it can't have is no remedy.
              changed={invoice.refuses?.download ? null : changed}
              unrated={invoice.unratedEntries ?? []}
              error={error}
            />
            <InvoicePreviewCard
              heading={false}
              preview={{ ...invoice, schedules: invoice.supportingDetail }}
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
          </>
        )}
      </Listing>
      <MarkPaidDialog {...markPaid.dialog} />
    </DetailPage>
  );
}

/** The title and what can be done to the invoice: the page's frame, so it
    paints at once (`.claude/rules/web-ui.md`). Until the invoice answers its
    actions are disabled, picked by the status the list row gave, or a
    draft's on a cold load, the common case. */
function Header({
  invoice,
  ready,
  changed,
  onDownload,
  setStatus,
  remove,
  markPaid,
}: {
  invoice: Shown | undefined;
  ready: boolean;
  changed: DraftChange | null | undefined;
  onDownload: () => void;
  setStatus: {
    mutate: (args: { status: InvoiceStatus }) => void;
    isPending: boolean;
    reset: () => void;
  };
  remove: { mutate: () => void; isPending: boolean };
  markPaid: ReturnType<typeof useMarkPaid>;
}) {
  const status = invoice?.status ?? 'draft';
  const isDraft = status === 'draft';
  const number = invoice?.invoiceNumber ?? '';
  const refuses = invoice?.refuses ?? { download: false, send: false };

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {invoice ? (
          <>
            <h1 className="truncate type-title text-strong">{number}</h1>
            <StatusBadge status={status} />
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Deleting removes the draft and voiding can't be undone, so each
            asks first. */}
        {isDraft ? (
          <ConfirmAction
            label={`Delete ${number} for good`}
            pendingLabel="Deleting…"
            consequence="Its work stays unbilled."
            pending={remove.isPending}
            disabled={!ready}
            onConfirm={() => remove.mutate()}
          >
            <Trash2 aria-hidden strokeWidth={1.75} />
            Delete draft
          </ConfirmAction>
        ) : null}

        {status !== 'void' && !isDraft ? (
          <ConfirmAction
            label={`Void ${number}`}
            pendingLabel="Voiding…"
            consequence="The number stays on record, and this invoice can't be reissued."
            pending={setStatus.isPending}
            disabled={!ready}
            onConfirm={() => setStatus.mutate({ status: 'void' })}
          >
            <Ban aria-hidden strokeWidth={1.75} />
            Void
          </ConfirmAction>
        ) : null}

        {isDraft ? (
          <Button
            onClick={() => setStatus.mutate({ status: 'sent' })}
            disabled={
              !ready || setStatus.isPending || changed != null || refuses.send
            }
          >
            <Send aria-hidden strokeWidth={1.75} />
            Mark sent
          </Button>
        ) : null}

        {status === 'sent' && invoice ? (
          <Button
            variant="accent"
            onClick={() => {
              // A void error from earlier on this screen must not read as
              // a rejection of the payment date about to be entered.
              setStatus.reset();
              markPaid.show(invoice);
            }}
            disabled={
              !ready || setStatus.isPending || markPaid.isPending(invoice.id)
            }
          >
            {/* A currency glyph, not a check: the check commits a form. */}
            <DollarSign aria-hidden strokeWidth={1.75} />
            Mark paid
          </Button>
        ) : null}

        {/* Downloading is how an invoice reaches a client: the app sends no
            mail, so it is last, as the primary action. Only the invoice
            itself says whether its PDF opens, so until then it is Download,
            disabled. */}
        {invoice?.canDownload === false ? (
          <Button asChild>
            <Link href="/settings#plan">
              <Lock aria-hidden strokeWidth={1.75} />
              Subscribe to download
            </Link>
          </Button>
        ) : ready && !refuses.download && invoice ? (
          <Button asChild>
            <a href={api.invoicePdfUrl(invoice.id, true)} onClick={onDownload}>
              <Download aria-hidden strokeWidth={1.75} />
              Download PDF
            </a>
          </Button>
        ) : (
          <Button disabled>
            <Download aria-hidden strokeWidth={1.75} />
            Download PDF
          </Button>
        )}
      </div>
    </header>
  );
}

function statusHint(
  status: InvoiceStatus,
  period: { periodStart: string; periodEnd: string },
): string | null {
  if (status === 'draft')
    return `It keeps collecting ${shortDate(period.periodStart)} – ${shortDate(period.periodEnd)} until you mark it sent. Download it, send it from your own address, then mark it sent.`;
  if (status === 'void') return 'Voided. Its entries can be billed again.';
  return null;
}

/** Where the invoice stands, and what holds it, under the title. */
function Notices({
  invoice,
  changed,
  unrated,
  error,
}: {
  invoice: Shown;
  changed: DraftChange | null | undefined;
  unrated: UnratedEntry[];
  error: unknown;
}) {
  const hint = changed
    ? 'Download the new PDF, send it from your own address, then mark it sent.'
    : statusHint(invoice.status, invoice);
  return (
    <div className="flex flex-col gap-1 pt-1 pb-6">
      {hint ? <p className="type-support text-muted">{hint}</p> : null}
      {changed ? (
        <Changed change={changed} currency={invoice.currency} />
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

/** What moved since the PDF the client may already hold. No button: the
    header's Download PDF is the one action, and this says why Mark sent
    waits for it. */
function Changed({
  change,
  currency,
}: {
  change: DraftChange;
  currency: string;
}) {
  const added = change.hours.to - change.hours.from;
  return (
    <div role="status" className={NOTICE}>
      <p className="type-body text-strong">Changed since you downloaded it</p>
      <p className="type-support text-muted">
        {added === 0
          ? 'Its lines changed'
          : `${formatHours(Math.abs(added))}h ${added > 0 ? 'added' : 'removed'}`}{' '}
        · total{' '}
        <s className="text-subtle">
          {formatCurrency(change.total.from, currency)}
        </s>{' '}
        →{' '}
        <span className="text-strong">
          {formatCurrency(change.total.to, currency)}
        </span>
        . Download the new PDF to mark it sent.
      </p>
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
          : `The due date you typed, ${shortDate(due)}, is before today’s issue date, ${shortDate(issued)}, so it can’t be downloaded or sent. Delete this draft and generate it again with a later due date.`}
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
