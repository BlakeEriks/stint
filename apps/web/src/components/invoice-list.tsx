'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Plus, Send } from 'lucide-react';
import { keys } from '@stint/client';
import { formatCurrency } from '@stint/core';
import { motion } from '@stint/design-tokens';
import { usePrefetchInvoices } from '@/lib/client/prefetch-invoices';
import { useMarkPaid } from '@/lib/client/use-mark-paid';
import { useMarkSent } from '@/lib/client/use-mark-sent';
import { useCountUp } from '@/lib/client/use-count-up';
import { useFlip } from '@/lib/client/use-flip';
import { useClients, useClientsQuery } from '@/lib/client/use-project-colors';
import { timeZone } from '@/lib/client/use-timer';
import {
  invoiceSections,
  lastPaid,
  sectionDate,
  type Section,
} from '@/lib/client/invoice-sections';
import { api, type Invoice } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { StatusBadge, periodName } from './invoice-bits';
import { MarkPaidDialog } from './mark-paid-dialog';
import { MarkSentDialog } from './mark-sent-dialog';
import { Pip } from './home-shell';
import { Listing, Page } from './page';

type Client = { name: string; color: string | null };
type Clients = Map<string, Client>;
type RowPress = { onPress?: () => void; busy: boolean };

/**
 * The month at a glance: what is still open on top, each year's history
 * below. This is the screen to open when money lands, so marking a row paid
 * carries it into its year, where the total takes it in.
 */
export function InvoiceList() {
  const query = useQuery({
    queryKey: keys.invoices(),
    queryFn: () => api.invoices(),
    select: (r) => r.invoices,
  });
  usePrefetchInvoices(query.data);
  const clientQuery = useClientsQuery();
  const clients = useClients();

  const markPaid = useMarkPaid();
  const markSent = useMarkSent();
  const press = (invoice: Invoice): RowPress => ({
    onPress:
      invoice.status === 'draft'
        ? () => markSent.show(invoice)
        : invoice.status === 'sent'
          ? () => markPaid.show(invoice)
          : undefined,
    busy: markSent.isPending(invoice.id) || markPaid.isPending(invoice.id),
  });

  return (
    <Page
      title="Invoices"
      actions={
        <Button asChild>
          <Link href="/invoices/new">
            <Plus aria-hidden strokeWidth={2.25} />
            New invoice
          </Link>
        </Button>
      }
    >
      <Listing
        query={query}
        also={[clientQuery]}
        empty="No invoices yet. Preview a period to see what it would bill."
      >
        {(invoices) => (
          <Sections invoices={invoices} clients={clients} press={press} />
        )}
      </Listing>

      <MarkPaidDialog {...markPaid.dialog} />
      {markSent.dialog ? <MarkSentDialog {...markSent.dialog} /> : null}
    </Page>
  );
}

function Sections({
  invoices,
  clients,
  press,
}: {
  invoices: Invoice[];
  clients: Clients;
  press: (invoice: Invoice) => RowPress;
}) {
  const sections = invoiceSections(invoices, timeZone);
  const { container, register } = useFlip(
    sections
      .map((s) => `${s.key}:${s.invoices.map((i) => i.id).join(',')}`)
      .join('|'),
  );

  return (
    <div
      ref={(el) => {
        container.current = el;
      }}
    >
      {sections.some((s) => s.open) ? null : (
        <AllClear invoice={lastPaid(invoices)} clients={clients} />
      )}
      {sections.map((section) => (
        <section key={section.key} aria-label={section.name}>
          <SectionHead
            section={section}
            currency={invoices[0]?.currency}
            ref={register(`head:${section.key}`, { fade: true })}
          />
          <ul className="divide-y divide-edge-subtle">
            {section.invoices.map((invoice) => (
              <li
                key={invoice.id}
                ref={register(invoice.id, { group: section.key })}
              >
                <Row
                  invoice={invoice}
                  open={section.open}
                  client={clients.get(invoice.clientId)}
                  {...press(invoice)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** "Oct 1", from a date key. */
function monthDay(key: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00Z`));
}

const when = (invoice: Invoice) => monthDay(sectionDate(invoice, timeZone));

/** Nothing open, said quietly: no icon or color for an absence. */
function AllClear({
  invoice,
  clients,
}: {
  invoice: Invoice | undefined;
  clients: Clients;
}) {
  return (
    <p className="mt-[22px] type-support text-muted">
      Nothing open
      {invoice ? (
        <span className="text-subtle">
          {` · Last paid ${when(invoice)}, ${formatCurrency(invoice.total, invoice.currency)} from ${clients.get(invoice.clientId)?.name ?? 'Unknown client'}`}
        </span>
      ) : null}
    </p>
  );
}

function SectionHead({
  section,
  currency,
  ref,
}: {
  section: Section;
  currency: string | undefined;
  ref: (el: HTMLElement | null) => void;
}) {
  return (
    <h2
      ref={ref}
      className="mt-[22px] mb-[6px] flex items-baseline gap-2 text-subtle"
    >
      <span className="type-region-head">{section.name}</span>
      {section.note ? (
        <span className="type-support">{section.note}</span>
      ) : null}
      {section.total === null ? null : section.open ? (
        <span className="ml-auto type-amount">
          {formatCurrency(section.total, currency)}
        </span>
      ) : (
        <YearTotal
          figure={`invoices.${section.key}`}
          total={section.total}
          currency={currency}
        />
      )}
    </h2>
  );
}

const MOVE = Number.parseFloat(motion.move);

/** A year's total takes in a payment once its row has landed there. */
function YearTotal({
  figure,
  total,
  currency,
}: {
  figure: string;
  total: number;
  currency: string | undefined;
}) {
  const [landed, setLanded] = useState(total);
  useEffect(() => {
    const t = setTimeout(() => setLanded(total), MOVE);
    return () => clearTimeout(t);
  }, [total]);
  const { value } = useCountUp(figure, landed, { arrive: false });
  return (
    <span className="ml-auto type-amount">
      {formatCurrency(value, currency)}
    </span>
  );
}

function Row({
  invoice,
  open,
  client,
  onPress,
  busy,
}: {
  invoice: Invoice;
  /** In Drafts or Awaiting payment, rather than a year. */
  open: boolean;
  client?: Client;
  onPress?: () => void;
  busy: boolean;
}) {
  /* Open, the button sits centered on a desktop and under the amount on a
     phone; a year's row has none, so every amount ends at the same edge. */
  return (
    <div
      className={`relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 sm:items-center ${
        open
          ? 'py-[14px] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
          : 'py-[10px]'
      }`}
    >
      {/* The link stretches over the row and the button sits above it: an
          <a> holding a <button> is invalid HTML and breaks keyboard
          navigation. Prefetched in full: the route is dynamic, so the
          default prefetch stops at `loading.tsx`. */}
      <Link
        href={`/invoices/${invoice.id}`}
        prefetch
        className="row-span-2 min-w-0 rounded-sm after:absolute after:inset-0 hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none sm:row-span-1"
      >
        <span
          className={`block type-control ${open ? 'text-strong' : 'text-primary'}`}
        >
          {invoice.invoiceNumber}
        </span>
        <Meta invoice={invoice} client={client} />
      </Link>

      {open && onPress ? (
        <span className="relative col-start-2 row-start-2 mt-2 justify-self-end sm:row-start-1 sm:mt-0 sm:justify-self-center">
          <RowButton invoice={invoice} onPress={onPress} busy={busy} />
        </span>
      ) : null}

      <span
        className={`col-start-2 row-start-1 text-right type-amount text-primary ${
          open ? 'sm:col-start-3' : ''
        } ${invoice.status === 'void' ? 'line-through' : ''}`}
      >
        {formatCurrency(invoice.total, invoice.currency)}
      </span>
    </div>
  );
}

/** What happened to it, and when: "Created Oct 1". */
const VERB = { draft: 'Created', sent: 'Sent', paid: 'Paid' } as const;

/** Client, period, and what happened when. On a phone the period starts
    its own line and drops the dot that would lead it. */
function Meta({ invoice, client }: { invoice: Invoice; client?: Client }) {
  return (
    <span className="mt-0.5 block type-support text-subtle">
      <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
        <Pip color={client?.color} />
        <span className="truncate text-muted">
          {client?.name ?? 'Unknown client'}
        </span>
      </span>
      <span className="block sm:inline">
        <span className="hidden sm:inline">{' · '}</span>
        {periodName(invoice.periodStart, invoice.periodEnd)}
        {invoice.status === 'void' ? (
          <>
            {' '}
            <StatusBadge status="void" />
          </>
        ) : (
          ` · ${VERB[invoice.status]} ${when(invoice)}`
        )}
      </span>
    </span>
  );
}

function RowButton({
  invoice,
  onPress,
  busy,
}: {
  invoice: Invoice;
  onPress: () => void;
  busy: boolean;
}) {
  const [label, Icon] =
    invoice.status === 'draft'
      ? (['Mark sent', Send] as const)
      : (['Mark paid', DollarSign] as const);
  return (
    <Button
      type="button"
      size="xs"
      aria-label={`${label}, ${invoice.invoiceNumber}`}
      disabled={busy}
      onClick={onPress}
    >
      {/* A currency glyph for paid, not a check: the check commits a form. */}
      <Icon aria-hidden />
      {label}
    </Button>
  );
}
