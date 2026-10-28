'use client';

import {
  type PaymentDetails,
  paymentTermsText,
  type ScheduleKind,
} from '@stint/core';
import type { InvoiceTemplate } from '@stint/schema';
import type {
  Client,
  Invoice,
  InvoicePreview,
  Settings,
} from '@/lib/client/api';
import { useScrollerFocus } from '@/lib/client/use-scroller-focus';
import { shortDate } from './invoice-bits';
import { DetailPaper, InvoicePaper, type PaperInvoice } from './invoice-paper';

type Business = Pick<Invoice['business'], 'name' | 'address' | 'email'>;

/** The From block generation will freeze, from settings as they are now. */
export function businessOf(settings: Settings): Invoice['business'];
export function businessOf(
  settings: Settings | undefined,
): Invoice['business'] | undefined;
export function businessOf(settings: Settings | undefined) {
  if (!settings) return undefined;
  return {
    name: settings.businessName,
    address: settings.businessAddress,
    email: settings.businessEmail,
    logoUrl: settings.logoUrl,
  };
}

/** What the card prints from: a preview, or an issued invoice. Lines are
    absent while an issued one is still loading them. */
export type CardFigures = Pick<
  InvoicePreview,
  | 'periodStart'
  | 'periodEnd'
  | 'subtotal'
  | 'taxRate'
  | 'taxAmount'
  | 'expensesSubtotal'
  | 'total'
  | 'currency'
  | 'schedules'
> & {
  lineItems?: Array<
    Pick<
      InvoicePreview['lineItems'][number],
      'description' | 'unit' | 'quantity' | 'unitPrice' | 'amount' | 'spentOn'
    > & { isNew?: boolean }
  >;
  entryCount?: number;
};

/**
 * The invoice as its PDF prints it, line for line: live beside the New
 * invoice form, and as issued on its detail page.
 *
 * The lines, totals and schedules are the server's answer; the rest — the
 * business block, the number, the dates, the payment block, which schedules
 * are ticked — is known here and shows in the same frame as the change that
 * set it. While the server recomputes, the figures dim and the caption says
 * so rather than showing a guess.
 */
export function InvoicePreviewCard({
  template,
  preview,
  client,
  business,
  number,
  issued,
  due,
  reference,
  payment,
  schedules,
  updating,
  paymentTerms,
  notes,
  heading = true,
  noSender = false,
  footnote,
  entryAction,
  children,
}: {
  template: InvoiceTemplate;
  preview: CardFigures | undefined;
  client: Pick<Client, 'name' | 'address' | 'email'> | undefined;
  /** Undefined while it loads. */
  business: Business | undefined;
  /** A prediction: generation allocates the number. */
  number: string;
  issued: string;
  due: string;
  reference: string;
  payment: PaymentDetails | null;
  schedules: ScheduleKind[];
  updating: boolean;
  /** Undefined prints the terms generation will freeze, made from `issued`
   *  and `due`. */
  paymentTerms?: string | null;
  notes?: string | null;
  /** False on an issued invoice, which is the invoice, not a preview of it. */
  heading?: boolean;
  /** No business name or email yet: a draft marks where they will print. */
  noSender?: boolean;
  /** Under the card, after `children`. */
  footnote?: string;
  /** Beside the entry count: an action on the entries it counts. */
  entryAction?: React.ReactNode;
  /** Warnings and errors, under the card. */
  children?: React.ReactNode;
}) {
  const terms =
    paymentTerms === undefined ? termsFrom(issued, due) : paymentTerms;
  const scrollerFocus = useScrollerFocus();

  return (
    <section
      aria-labelledby="inv-preview"
      aria-busy={updating}
      className="flex min-h-0 flex-col"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2.5">
        {/* Hidden, not dropped: the schedules' headings sit under it. */}
        <h2
          id="inv-preview"
          className={heading ? 'type-section text-strong' : 'sr-only'}
        >
          {heading ? 'Preview' : 'Invoice'}
        </h2>
        {client ? (
          <span className="ml-auto flex items-center gap-2">
            <Caption updating={updating} entries={preview?.entryCount} />
            {entryAction}
          </span>
        ) : null}
      </div>

      {client ? (
        /* The scroller is around the card, not in it: the card moves as one
           page, edges and all, while the caption above keeps "Updating…" in
           view. */
        <div tabIndex={scrollerFocus} className="min-h-0 overflow-y-auto">
          <div
            className={`@container/card flex flex-col gap-5 rounded-lg border border-edge-subtle bg-surface-elevated p-6 transition-opacity duration-150 ${
              updating ? 'opacity-50' : ''
            }`}
          >
            <InvoicePaper
              template={template}
              invoice={paperOf({
                preview,
                client,
                business,
                noSender,
                number,
                issued,
                due,
                reference,
                payment,
                terms,
                notes,
              })}
            />

            {preview?.schedules?.totalHours && schedules.length > 0 ? (
              <DetailPaper
                template={template}
                detail={preview.schedules}
                chosen={schedules}
                heading={`${number} · ${client.name} · ${shortDate(preview.periodStart)} – ${shortDate(preview.periodEnd)}`}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <p className="px-1 type-support text-subtle">
          Choose a client to see what this invoice will say.
        </p>
      )}

      <UnderCard noSender={Boolean(client) && noSender} footnote={footnote}>
        {children}
      </UnderCard>
    </section>
  );
}

/** The card's props as the paper prints them; blanks print as absent. */
function paperOf(p: {
  preview: CardFigures | undefined;
  client: Pick<Client, 'name' | 'address' | 'email'>;
  business: Business | undefined;
  noSender: boolean;
  number: string;
  issued: string;
  due: string;
  reference: string;
  payment: PaymentDetails | null;
  terms: string | null | undefined;
  notes: string | null | undefined;
}): PaperInvoice {
  const { preview } = p;
  return {
    number: p.number,
    issued: p.issued,
    due: p.due || null,
    period: preview
      ? { start: preview.periodStart, end: preview.periodEnd }
      : null,
    reference: p.reference || null,
    business: p.business,
    noSender: p.noSender,
    client: p.client,
    lines: preview?.lineItems?.map((li) => ({
      ...li,
      quantity: li.quantity ?? 0,
      amount: li.amount ?? 0,
    })),
    subtotal: preview?.subtotal ?? 0,
    taxRate: preview?.taxRate ?? 0,
    taxAmount: preview?.taxAmount ?? 0,
    expensesSubtotal: preview?.expensesSubtotal ?? 0,
    total: preview?.total ?? 0,
    currency: preview?.currency ?? 'USD',
    terms: p.terms ?? null,
    payment: p.payment,
    notes: p.notes ?? null,
  };
}

/** The terms generation will freeze, made from `issued` and `due`. */
function termsFrom(issued: string, due: string): string | null {
  return due && due >= issued ? paymentTermsText(issued, due) : null;
}

/** The card reads as the PDF will, so anything that won't print goes here,
    below it. */
function UnderCard({
  noSender,
  footnote,
  children,
}: {
  noSender: boolean;
  footnote: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-1 pt-2.5 empty:hidden">
      {noSender ? (
        <p className="type-support text-subtle">
          Your business name and email print in the dashed box.
        </p>
      ) : null}
      {children}
      {footnote ? <p className="type-support text-subtle">{footnote}</p> : null}
    </div>
  );
}

function Caption({
  updating,
  entries,
}: {
  updating: boolean;
  entries: number | undefined;
}) {
  if (updating)
    return <span className="type-support text-subtle">Updating…</span>;
  if (entries === undefined) return null;
  return (
    <span className="type-support text-subtle">
      {entries} entr{entries === 1 ? 'y' : 'ies'}
    </span>
  );
}

/** The business, and the invoice's number and dates. */
