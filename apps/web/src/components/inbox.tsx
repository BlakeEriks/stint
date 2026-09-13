'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCompact } from '@stint/core';
import {
  AlarmClock,
  AlertTriangle,
  Check,
  Clock,
  Download,
  FileWarning,
  Inbox as InboxIcon,
} from 'lucide-react';
import { api, type InvoiceStatus, type Stats } from '@/lib/client/api';
import { useRunaway } from '@/lib/client/use-runaway';
import { Button } from './ui/button';
import { money } from './invoice-bits';

/**
 * The dock's inbox: everything that wants a decision, in one fixed place.
 *
 * **It is always here, including when it is empty**, and that is a reversal.
 * The card this replaces rendered only when it had rows, on the argument that
 * a permanent "all clear" says nothing — the `SaveIndicator` rule. That rule
 * does not transfer. A save indicator is transient and sits inline with a
 * form, so always-present really does mean always-ignored; **a dock region is
 * furniture**, and furniture staying put is the entire point of a dock. A
 * user wondering where a section went is a real cost, and "Nothing needs you"
 * is information rather than noise.
 *
 * It is also why the name changed. "Needs attention" is a predicate, which
 * suited a card that appeared only when the predicate was true. An inbox is a
 * place, and this is now a place.
 *
 * **Not a card.** In a 280px dock, the dock's own padding plus a card's
 * border and padding spent roughly 50px of 280 on nesting before any content.
 * These are rows on the dock's surface, separated by rules — the dock is
 * already the container, so a second one inside it is wasted width.
 */
export function Inbox({ stats }: { stats: Stats }) {
  const { overdueInvoices, staleDrafts, unprojected } = stats.attention;
  const queryClient = useQueryClient();
  const runaway = useRunaway();

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      api.updateInvoiceStatus(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const count =
    overdueInvoices.length +
    staleDrafts.length +
    (unprojected ? 1 : 0) +
    (runaway.showing ? 1 : 0);

  return (
    <section aria-label="Inbox">
      <header className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* `aria-hidden`, so the accessible name stays "Inbox" rather than
              "inbox Inbox". Neutral: the section is a place, and the rows
              inside it carry their own tone. */}
          <InboxIcon
            aria-hidden
            strokeWidth={1.75}
            className="size-3.5 flex-none text-subtle"
          />
          <h2 className="type-label truncate text-subtle">Inbox</h2>
        </div>
        {/* The count is the whole status. No badge colour: a number that is
            sometimes zero says more than a dot that is sometimes lit. */}
        <span className="type-meta text-subtle">{count || 'clear'}</span>
      </header>

      {count === 0 ? (
        <p className="px-1 py-3 type-support text-subtle">Nothing needs you.</p>
      ) : (
        <ul className="flex flex-col">
          {/* The runaway timer sorts above the invoices: it is the only row
              about time being recorded WRONGLY RIGHT NOW, where an overdue
              invoice is about money that is already late and will still be
              late in an hour. It is also the only row whose subject is still
              changing while you read it. */}
          {runaway.showing ? <RunawayItem runaway={runaway} /> : null}

          {/* Overdue sorts first among the invoices and carries danger;
              everything else is a warning. Never the accent — that belongs to
              the running timer. */}
          {overdueInvoices.map((i) => (
            <Item
              key={i.invoiceId}
              href={`/invoices/${i.invoiceId}`}
              icon={
                <AlertTriangle aria-hidden className="size-3.5 text-danger" />
              }
              label={i.clientName ?? i.invoiceNumber}
              detail={`${i.daysLate} ${i.daysLate === 1 ? 'day' : 'days'} late`}
              value={money(i.amount, i.currency)}
              tone="danger"
              actions={
                <>
                  {/* The money usually arrived and was never recorded, so
                      this is the action nine times in ten. */}
                  <Action
                    label={`Mark ${i.invoiceNumber} paid`}
                    icon={<Check aria-hidden className="size-3.5" />}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({ id: i.invoiceId, status: 'paid' })
                    }
                  />
                  <Action
                    label={`Download ${i.invoiceNumber}`}
                    icon={<Download aria-hidden className="size-3.5" />}
                    href={`/api/v1/invoices/${i.invoiceId}/pdf`}
                  />
                </>
              }
            />
          ))}

          {staleDrafts.map((d) => (
            <Item
              key={d.invoiceId}
              href={`/invoices/${d.invoiceId}`}
              icon={
                <FileWarning aria-hidden className="size-3.5 text-warning" />
              }
              label={d.clientName ?? d.invoiceNumber}
              detail={`draft, ${d.ageDays}d old`}
              value={money(d.amount, d.currency)}
              tone="warning"
              actions={
                <Action
                  label={`Download ${d.invoiceNumber}`}
                  icon={<Download aria-hidden className="size-3.5" />}
                  href={`/api/v1/invoices/${d.invoiceId}/pdf`}
                />
              }
            />
          ))}

          {unprojected ? (
            <Item
              href="/"
              icon={<Clock aria-hidden className="size-3.5 text-warning" />}
              label={
                unprojected.count === 1
                  ? '1 entry, no project'
                  : `${unprojected.count} entries, no project`
              }
              detail="cannot resolve a rate"
              value={formatCompact(unprojected.seconds)}
              tone="warning"
            />
          ) : null}
        </ul>
      )}
    </section>
  );
}

/**
 * The runaway timer's row: surfaced here, decided here.
 *
 * **Not an `Item`.** That row is a link to a record that already exists, with
 * icon-only actions — and neither fits. There is nowhere to navigate (the
 * entry is still running, so it has no detail page), and Keep / Adjust /
 * Discard cannot be icons: they are three different judgements about billable
 * work, and an icon that means "discard 52 hours" is not one a user should
 * have to decode.
 *
 * It moved out of the timer bar because the notice GREW the bar — chrome
 * reflowing at the moment a problem appears, which is the same failure the
 * inbox was built to fix when it was a card that vanished on success. The bar
 * is a fixed readout; this is something that wants a decision, and the inbox
 * is where those live.
 */
function RunawayItem({ runaway }: { runaway: ReturnType<typeof useRunaway> }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  return (
    <li className="border-t border-edge-subtle first:border-t-0">
      <div className="flex gap-2 px-1 py-2.5">
        <span className="mt-0.5 flex-none">
          <AlarmClock aria-hidden className="size-3.5 text-warning" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Plain text, not a link: the entry is still running, so there is
              no record to open yet. */}
          <span className="truncate type-control text-primary">
            Timer still running
          </span>

          <span className="truncate type-meta text-warning">
            {runaway.hours} hours so far
          </span>

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {confirmingDiscard ? (
              <>
                <span className="type-support text-muted">Delete it?</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  disabled={runaway.busy}
                  onClick={runaway.discard}
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmingDiscard(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                {/* Keep is first and plainest: the timer being long is often
                    correct, and the app must not imply otherwise. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={runaway.keep}
                >
                  Keep
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={runaway.busy}
                  onClick={runaway.adjust}
                >
                  Adjust
                </Button>
                {/* Destructive, so it asks. Discarding a 16-hour entry you
                    actually worked is not recoverable. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={runaway.busy}
                  onClick={() => setConfirmingDiscard(true)}
                >
                  Discard
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * One inbox row.
 *
 * Stacked rather than tabular: at 280px there is no room for a label column
 * and a value column that both hold their width, and the label is what
 * identifies the row. The value sits on the second line beside the detail.
 */
function Item({
  href,
  icon,
  label,
  detail,
  value,
  tone,
  actions,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  value: string;
  tone: 'danger' | 'warning';
  actions?: React.ReactNode;
}) {
  return (
    <li className="border-t border-edge-subtle first:border-t-0">
      <div className="flex gap-2 px-1 py-2.5">
        <span className="mt-0.5 flex-none">{icon}</span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The link is the label alone — an <a> wrapping the buttons below
              would be invalid HTML and put Tab inside the link. */}
          <Link
            href={href}
            className="truncate rounded-sm type-control text-primary hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
          >
            {label}
          </Link>

          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate type-meta ${
                tone === 'danger' ? 'text-danger' : 'text-warning'
              }`}
            >
              {detail}
            </span>
            <span className="flex-none type-meta text-primary">{value}</span>
          </div>

          {actions ? (
            <div className="mt-1 flex items-center gap-1">{actions}</div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * An inline action, icon-only.
 *
 * There is no room for labels at 280px, so `aria-label` carries the name —
 * and it names its invoice, because a column of identical icon buttons is
 * unusable with a screen reader.
 */
function Action({
  label,
  icon,
  onClick,
  href,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const className =
    'grid size-6 place-items-center rounded text-subtle transition-colors hover:bg-surface-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none disabled:opacity-50';

  return href ? (
    <a href={href} aria-label={label} download className={className}>
      {icon}
    </a>
  ) : (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {icon}
    </button>
  );
}
