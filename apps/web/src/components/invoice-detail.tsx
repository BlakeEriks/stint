'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Section } from './field';
import { StatusBadge, shortDate } from './invoice-bits';
import { formatCurrency, formatHours } from '@stint/core';
import { api, ApiError, type InvoiceStatus } from '@/lib/client/api';
import { DetailPage, Listing } from './page';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

export function InvoiceDetail({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.invoice(id),
    queryFn: () => api.invoice(id),
  });

  /* Voiding releases the entries and deleting a draft frees them, so every
     view of that work moves with the invoice. */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.invoices() });
    invalidateEntryData(queryClient);
  };

  const setStatus = useMutation({
    mutationFn: (status: InvoiceStatus) =>
      api.updateInvoiceStatus(id, { status }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => api.deleteInvoice(id),
    onSuccess: () => {
      invalidate();
      router.push('/invoices');
    },
  });

  return (
    <DetailPage back="/invoices" label="Invoices">
      <Listing query={query} missing="That invoice no longer exists.">
        {(data) => (
          <Loaded
            data={data}
            setStatus={setStatus}
            remove={remove}
            error={remove.error ?? setStatus.error}
          />
        )}
      </Listing>
    </DetailPage>
  );
}

/** The invoice itself, once it has arrived. */
function Loaded({
  data,
  setStatus,
  remove,
  error,
}: {
  data: Awaited<ReturnType<typeof api.invoice>>;
  setStatus: { mutate: (s: InvoiceStatus) => void; isPending: boolean };
  remove: { mutate: () => void; isPending: boolean };
  /* Picked ONCE by the caller. Re-evaluating `a ?? b` for the check and again
     for the message could type-check a stale error while printing a different
     one — React Query holds the last error until the next success. */
  error: unknown;
}) {
  const { lineItems, client, ...invoice } = data;
  const isDraft = invoice.status === 'draft';
  const isVoid = invoice.status === 'void';

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate type-title text-strong">
              {invoice.invoiceNumber}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 type-control text-muted">
            {client.name} · {shortDate(invoice.periodStart)} –{' '}
            {shortDate(invoice.periodEnd)}
          </p>
        </div>

        <div className="flex flex-none flex-wrap gap-2">
          {/* Downloading is how an invoice reaches a client: the app sends no
              mail, so this is the primary action on the screen. */}
          <Button asChild>
            <a href={api.invoicePdfUrl(invoice.id, true)}>Download PDF</a>
          </Button>
          <Button asChild variant="secondary">
            <a
              href={api.invoicePdfUrl(invoice.id)}
              target="_blank"
              rel="noreferrer"
            >
              Preview
            </a>
          </Button>
        </div>
      </header>

      <Section title="Lines">
        <div className="overflow-x-auto">
          <table className="w-full type-support">
            <thead>
              <tr className="border-b border-edge-subtle text-left">
                <th scope="col" className={TH}>
                  Description
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Hours
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Rate
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr
                  key={i}
                  className="border-b border-edge-subtle last:border-0"
                >
                  <td className="py-2 pr-3 text-primary">{item.description}</td>
                  <td className="type-duration py-2 pl-3 text-right text-muted">
                    {formatHours(item.quantityHours)}
                  </td>
                  <td className="type-duration py-2 pl-3 text-right text-muted">
                    {formatCurrency(item.resolvedRate, invoice.currency)}
                  </td>
                  <td className="type-duration py-2 pl-3 text-right text-strong">
                    {formatCurrency(item.amount, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto flex w-full max-w-[16rem] flex-col gap-1 type-support">
          <Row
            label="Subtotal"
            value={formatCurrency(invoice.subtotal, invoice.currency)}
          />
          {invoice.taxRate > 0 ? (
            <Row
              label={`Tax (${invoice.taxRate}%)`}
              value={formatCurrency(invoice.taxAmount, invoice.currency)}
            />
          ) : null}
          <Row
            label="Total"
            value={formatCurrency(invoice.total, invoice.currency)}
            strong
          />
        </dl>

        <p className="type-support text-subtle">
          Rates are frozen at generation — editing a client or project later
          never changes this invoice.
        </p>
      </Section>

      <div className="mt-4">
        <Section title="Status" description={statusHint(invoice.status)}>
          <div className="flex flex-wrap items-center gap-2">
            {invoice.status === 'draft' ? (
              <Button
                variant="secondary"
                onClick={() => setStatus.mutate('sent')}
                disabled={setStatus.isPending}
              >
                Mark sent
              </Button>
            ) : null}

            {invoice.status === 'sent' ? (
              <Button
                variant="secondary"
                onClick={() => setStatus.mutate('paid')}
                disabled={setStatus.isPending}
              >
                Mark paid
              </Button>
            ) : null}

            {!isVoid && !isDraft ? (
              <Button
                variant="ghost"
                onClick={() => setStatus.mutate('void')}
                disabled={setStatus.isPending}
              >
                Void
              </Button>
            ) : null}

            {isDraft ? (
              <Button
                variant="ghost"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Delete draft
              </Button>
            ) : null}
          </div>

          <ActionError error={error} />
        </Section>
      </div>
    </>
  );
}

const TH = 'pb-2 type-label text-subtle';

function statusHint(status: InvoiceStatus): string {
  if (status === 'draft')
    return 'Download it, send it from your own address, then mark it sent.';
  if (status === 'sent') return 'Awaiting payment.';
  if (status === 'paid') return 'Settled.';
  return 'Voided. The number stays on record so numbering is gapless, and the entries were released for re-billing.';
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

function Row({
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
