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
import { attachedSchedules, formatCurrency, formatHours } from '@stint/core';
import {
  api,
  ApiError,
  type DraftChange,
  type Invoice,
  type InvoiceStatus,
  type StoredLineItem,
} from '@/lib/client/api';
import { DetailPage, Listing } from './page';

/** An invoice; the lines, and whether its PDF opens, are absent until they
    load. */
type Shown = Invoice & {
  lineItems?: (StoredLineItem & { isNew?: boolean })[];
  entryCount?: number;
  canDownload?: boolean;
  changedSinceDownload?: DraftChange | null;
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
  /* The payment notice's, so the invoice paints whole; the list fetches it
     too, so one opened from there still opens at once. */
  const settings = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
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

  return (
    <DetailPage back="/invoices" label="Invoices">
      <Listing
        query={query}
        also={[settings]}
        missing="That invoice no longer exists."
      >
        {(data) => (
          <Loaded
            data={data}
            onDownload={() =>
              /* The download is a navigation the page can't await, and it is
                 what records the copy the client gets; the server's answer
                 replaces the change once the PDF has rendered. */
              setTimeout(
                () => qc.invalidateQueries({ queryKey: keys.invoice(id) }),
                1500,
              )
            }
            setStatus={setStatus}
            remove={remove}
            markPaid={markPaid}
            error={remove.error ?? setStatus.error ?? markPaid.error}
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
  };
  remove: { mutate: () => void; isPending: boolean };
  markPaid: ReturnType<typeof useMarkPaid>;
  /* Picked ONCE by the caller. Re-evaluating `a ?? b` for the check and again
     for the message could type-check a stale error while printing a different
     one — React Query holds the last error until the next success. */
  error: unknown;
}) {
  const isDraft = invoice.status === 'draft';
  const isVoid = invoice.status === 'void';
  /* A draft that moved since its PDF was rendered holds Mark sent until the
     client's copy is the one Stint keeps; pressing Download releases it here,
     and the server, which recorded the render, has the last word. */
  const [downloaded, setDownloaded] = useState(false);
  const changed = isDraft && !downloaded ? invoice.changedSinceDownload : null;
  /* For the payment notice, which the PDF reads from settings as they are
     now. */
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });

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
          {/* Deleting removes the draft and voiding can't be undone, so each
              asks first. */}
          {isDraft ? (
            <ConfirmAction
              label={`Delete ${invoice.invoiceNumber} for good`}
              pendingLabel="Deleting…"
              consequence="Its entries go back to unbilled."
              pending={remove.isPending}
              onConfirm={() => remove.mutate()}
            >
              <Trash2 aria-hidden strokeWidth={1.75} />
              Delete draft
            </ConfirmAction>
          ) : null}

          {!isVoid && !isDraft ? (
            <ConfirmAction
              label={`Void ${invoice.invoiceNumber}`}
              pendingLabel="Voiding…"
              consequence="The number stays on record, and this invoice can't be reissued."
              pending={setStatus.isPending}
              onConfirm={() => setStatus.mutate({ status: 'void' })}
            >
              <Ban aria-hidden strokeWidth={1.75} />
              Void
            </ConfirmAction>
          ) : null}

          {isDraft ? (
            <Button
              onClick={() => setStatus.mutate({ status: 'sent' })}
              disabled={setStatus.isPending || changed != null}
            >
              <Send aria-hidden strokeWidth={1.75} />
              Mark sent
            </Button>
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
          {invoice.canDownload === true ? (
            <Button asChild>
              <a
                href={api.invoicePdfUrl(invoice.id, true)}
                onClick={() => {
                  setDownloaded(true);
                  onDownload();
                }}
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
      <div className="flex flex-col gap-1 pt-1 pb-6">
        <p className="type-support text-muted">
          {changed
            ? 'Download the new PDF, send it from your own address, then mark it sent.'
            : statusHint(invoice.status, invoice.dueDate, invoice)}
        </p>
        {changed ? (
          <Changed change={changed} currency={invoice.currency} />
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

      <InvoicePreviewCard
        heading={false}
        preview={{
          ...invoice,
          schedules: invoice.supportingDetail,
          // Voiding released its entries: "0 entries" would read as empty.
          entryCount: isVoid ? undefined : invoice.entryCount,
        }}
        client={invoice.billTo}
        business={invoice.business}
        settings={settings}
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
        footnote={
          isDraft
            ? 'A draft follows its period’s work and current rates until you mark it sent.'
            : 'Rates are frozen once sent — editing a client or project later never changes this invoice.'
        }
      />

      <MarkPaidDialog {...markPaid.dialog} />
    </>
  );
}

function statusHint(
  status: InvoiceStatus,
  due: string | null,
  period: { periodStart: string; periodEnd: string },
): string {
  if (status === 'draft')
    return `It keeps collecting ${shortDate(period.periodStart)} – ${shortDate(period.periodEnd)} until you mark it sent. Download it, send it from your own address, then mark it sent.`;
  if (status === 'sent')
    return due
      ? `Awaiting payment. Due ${shortDate(due)}.`
      : 'Awaiting payment.';
  if (status === 'paid') return 'Settled.';
  return 'Voided. The number stays on record so numbering is gapless, and the entries were released for re-billing.';
}

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
    <div
      role="status"
      className="mt-3 flex flex-col gap-0.5 rounded-md border border-edge-default border-l-[3px] border-l-warning bg-surface-elevated px-3.5 py-3"
    >
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

/** Whatever went wrong last, in the user's terms. */
function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="type-support text-danger">
      {error instanceof ApiError ? error.message : 'That change was rejected.'}
    </p>
  );
}
