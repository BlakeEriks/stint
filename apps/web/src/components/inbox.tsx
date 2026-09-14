'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCompact } from '@stint/core';
import {
  Check,
  Clock,
  DollarSign,
  Download,
  FolderInput,
  Inbox as InboxIcon,
  Pencil,
  Send,
  Trash2,
} from 'lucide-react';
import {
  api,
  type InvoiceStatus,
  type Stats,
  type TimeEntry,
} from '@/lib/client/api';
import { useRunaway } from '@/lib/client/use-runaway';
import { useTimeZone } from '@/lib/client/use-timer';
import { EntryDialog } from './entry-dialog';
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
  const { overdueInvoices, staleDrafts, unprojected, strangeDurations } =
    stats.attention;
  const queryClient = useQueryClient();
  const runaway = useRunaway();

  /* The ENTRY being edited, not its id, and which field opened it.

     Holding the entry rather than the id is what keeps the dialog and its
     subject one piece of state. Keyed on the id, saving emptied the query
     that supplied the entry — the entry now has a project, so it leaves that
     result — while the id still said "open", and the editor reopened as a
     blank "Add entry". */
  const [assigning, setAssigning] = useState<TimeEntry | undefined>();
  const [focusField, setFocusField] = useState<'task' | 'project'>('task');
  const tz = useTimeZone();

  /* The stats rows carry enough to render, but `EntryDialog` edits a whole
     entry — so opening one fetches it. Keyed by id rather than filter: a
     strange-duration entry usually HAS a project, so `projectId=none` would
     not find it.

     The row says which field it is about: an unprojected row exists BECAUSE
     the project is missing, so the cursor belongs there rather than on a task
     name that is already right. */
  const { mutate: openEntry } = useMutation({
    mutationFn: ({ id }: { id: string; focus: 'task' | 'project' }) =>
      api.entry(id),
    onSuccess: (found, { focus }) => {
      setFocusField(focus);
      setAssigning(found);
    },
  });

  /* "It's correct" answers the question and nothing else — it never edits the
     times. A trigger clears the answer if they change later. */
  const confirmLength = useMutation({
    mutationFn: (id: string) => api.updateEntry(id, { durationOk: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  /* React Query dedupes this against Home's identical query, so on the one
     screen that renders both there is no second request. */
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
    select: (r) => r.projects,
  });

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
    unprojected.length +
    strangeDurations.length +
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
              label={i.clientName ?? i.invoiceNumber}
              detail={`${i.daysLate} ${i.daysLate === 1 ? 'day' : 'days'} late`}
              value={money(i.amount, i.currency)}
              tone="danger"
              actions={
                <>
                  {/* The money usually arrived and was never recorded, so
                      this is the action nine times in ten. A currency glyph,
                      not a check: the check belongs to "It's correct". */}
                  <Action
                    label="Mark paid"
                    ariaLabel={`Mark ${i.invoiceNumber} paid`}
                    icon={<DollarSign aria-hidden className="size-3.5" />}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({ id: i.invoiceId, status: 'paid' })
                    }
                  />
                  <Action
                    label="Download"
                    ariaLabel={`Download ${i.invoiceNumber}`}
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
              label={d.clientName ?? d.invoiceNumber}
              detail={`Draft, ${d.ageDays}d old`}
              value={money(d.amount, d.currency)}
              tone="warning"
              actions={
                <>
                  <Action
                    label="Mark sent"
                    ariaLabel={`Mark ${d.invoiceNumber} sent`}
                    icon={<Send aria-hidden className="size-3.5" />}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({ id: d.invoiceId, status: 'sent' })
                    }
                  />
                  <Action
                    label="Download"
                    ariaLabel={`Download ${d.invoiceNumber}`}
                    icon={<Download aria-hidden className="size-3.5" />}
                    href={`/api/v1/invoices/${d.invoiceId}/pdf`}
                  />
                </>
              }
            />
          ))}

          {/* One row per entry, not a rollup: the work is done an entry at a
              time — open it, assign a project, move to the next. */}
          {unprojected.map((u) => (
            <Item
              key={u.entryId}
              onSelect={() => openEntry({ id: u.entryId, focus: 'project' })}
              label={u.taskName || 'Untitled entry'}
              detail={`No project · ${dayLabel(u.startedAt, tz)}`}
              value={formatCompact(u.seconds)}
              tone="warning"
              actions={
                <Action
                  label="Assign project"
                  ariaLabel={`Assign a project to ${u.taskName || 'this entry'}`}
                  icon={<FolderInput aria-hidden className="size-3.5" />}
                  onClick={() => openEntry({ id: u.entryId, focus: 'project' })}
                />
              }
            />
          ))}

          {/* A record already written, where the runaway row is a timer still
              running. The qualifier names which threshold it tripped, because
              colour alone never says which way. */}
          {strangeDurations.map((e) => (
            <Item
              key={e.entryId}
              onSelect={() => openEntry({ id: e.entryId, focus: 'task' })}
              label={e.taskName || 'Untitled entry'}
              detail={[
                e.clientName ?? e.projectName,
                dayLabel(e.startedAt, tz),
                e.kind === 'short' ? 'unusually short' : 'unusually long',
              ]
                .filter(Boolean)
                .join(' · ')}
              value={formatCompact(e.seconds)}
              valueTone="warning"
              tone="warning"
              actions={
                <>
                  <Action
                    label="Edit entry"
                    ariaLabel={`Edit ${e.taskName || 'this entry'}`}
                    icon={<Pencil aria-hidden className="size-3.5" />}
                    onClick={() => openEntry({ id: e.entryId, focus: 'task' })}
                  />
                  {/* The one action that means "this is already right", and
                      the only one wearing a check mark. */}
                  <Action
                    label="It's correct"
                    ariaLabel={`Keep ${e.taskName || 'this entry'} as it is`}
                    icon={<Check aria-hidden className="size-3.5" />}
                    disabled={confirmLength.isPending}
                    onClick={() => confirmLength.mutate(e.entryId)}
                  />
                </>
              }
            />
          ))}
        </ul>
      )}

      {/* The inbox renders its own, rather than reaching for the timer bar's.
          Each surface opens the dialog on its own subject and they never open
          together, so a second instance is cheaper than a shared store that
          would have to carry two unrelated flows. */}
      <EntryDialog
        open={assigning !== undefined}
        onOpenChange={(o) => {
          if (!o) setAssigning(undefined);
        }}
        existing={assigning}
        focus={focusField}
        projects={projects}
        tz={tz}
      />
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
    <Item
      label="Timer still running"
      detail={`${runaway.hours} hours so far`}
      value={`${runaway.hours}h`}
      valueTone="warning"
      tone="warning"
      actions={
        confirmingDiscard ? (
          <>
            <span className="px-2 type-support text-muted">Delete it?</span>
            <Action
              label="Discard"
              icon={<Trash2 aria-hidden className="size-3.5" />}
              destructive
              disabled={runaway.busy}
              onClick={runaway.discard}
            />
            <Action
              label="Cancel"
              icon={<Clock aria-hidden className="size-3.5" />}
              onClick={() => setConfirmingDiscard(false)}
            />
          </>
        ) : (
          <>
            {/* Keep is first and plainest: the timer being long is often
                correct, and the app must not imply otherwise. A clock, not a
                check — the check belongs to "It's correct". */}
            {/* No aria-label: there is exactly one runaway row, so the
                visible word is already unambiguous. An aria-label here would
                only make the accessible name differ from what is read. */}
            <Action
              label="Keep"
              icon={<Clock aria-hidden className="size-3.5" />}
              onClick={runaway.keep}
            />
            <Action
              label="Adjust"
              icon={<Pencil aria-hidden className="size-3.5" />}
              disabled={runaway.busy}
              onClick={runaway.adjust}
            />
            {/* Destructive, so it asks. Discarding a 16-hour entry you
                actually worked is not recoverable. */}
            <Action
              label="Discard"
              icon={<Trash2 aria-hidden className="size-3.5" />}
              destructive
              disabled={runaway.busy}
              onClick={() => setConfirmingDiscard(true)}
            />
          </>
        )
      }
    />
  );
}

/**
 * The entry's own day, in the user's zone.
 *
 * A date rather than a time: these rows are about work already recorded, and
 * which day it landed on is what identifies it in a list.
 */
function dayLabel(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(new Date(iso));
}

/**
 * One inbox row.
 *
 * Two lines then an action slot: title and figure on the first, the qualifier
 * on the second. A title, a figure and three buttons do not share one line at
 * any dock width worth having.
 *
 * **Severity is the left rule, never a per-row icon.** Six small coloured
 * glyphs are six focal points; six aligned rules are one texture, and the
 * danger one in it is conspicuous. Colour never carries the meaning alone —
 * the qualifier states it in words.
 */
function Item({
  href,
  onSelect,
  label,
  detail,
  value,
  valueTone,
  tone,
  actions,
}: {
  /** A record with a page of its own. Omit it and pass `onSelect` instead. */
  href?: string;
  /** For a row that acts in place rather than navigating. */
  onSelect?: () => void;
  label: string;
  detail: string;
  value: string;
  /** Warning only where the figure IS the problem — a runaway or a length. */
  valueTone?: 'warning';
  tone: 'danger' | 'warning';
  actions?: React.ReactNode;
}) {
  const titleClass =
    'truncate text-left rounded-sm type-control text-strong hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

  return (
    <li
      className={`group rounded-r-md border-l-2 py-2.5 pr-2.5 pl-3 transition-colors hover:bg-surface-primary ${
        tone === 'danger' ? 'border-danger' : 'border-timer-warning'
      }`}
    >
      <div className="flex items-baseline gap-2.5">
        {href ? (
          <Link href={href} className={`flex-1 ${titleClass}`}>
            {label}
          </Link>
        ) : onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            className={`flex-1 ${titleClass}`}
          >
            {label}
          </button>
        ) : (
          /* Plain text where there is nothing to open — a running timer has
             no record yet. */
          <span className={`flex-1 ${titleClass} hover:no-underline`}>
            {label}
          </span>
        )}
        <span
          className={`flex-none ${
            valueTone === 'warning' ? 'text-warning' : 'text-primary'
          } ${value.startsWith('$') ? 'type-amount' : 'type-duration'}`}
        >
          {value}
        </span>
      </div>

      <div className="mt-px">
        <span
          className={`truncate type-support ${
            tone === 'danger' ? 'text-danger' : 'text-warning'
          }`}
        >
          {detail}
        </span>
      </div>

      {actions ? <ActionSlot>{actions}</ActionSlot> : null}
    </li>
  );
}

/**
 * The row's actions, revealed on hover.
 *
 * **The slot is always in flow; only its contents fade.** `display:none` would
 * drop it out of flow and the row would grow the moment a pointer crossed it —
 * six rows reflowing under the cursor is worse than the buttons ever were.
 *
 * `reveal-on-hover` (globals.css) keeps the buttons visible on a touch device,
 * where there is no hover to reveal them.
 *
 * **No negative margin.** Pulling the slot left by the button's own padding
 * aligns the LABEL with the title above it, but puts the button's hover
 * background 8px further left than anything else in the row — hard against
 * the severity rule. The box is the thing the eye sees, so the box is what
 * lines up.
 */
function ActionSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="reveal-on-hover mt-2 flex min-h-[26px] items-center gap-0.5">
      {children}
    </div>
  );
}

/**
 * An inline action: a label, and an icon that does not repeat another one.
 *
 * The check mark belongs to "It's correct" — the one action meaning "this is
 * already right" — so nothing else uses it. A single glyph on both `Keep` and
 * `Mark paid` would mean "change nothing" and "record a payment" at once.
 *
 * `aria-label` still names the invoice where the visible text is generic, so a
 * column of `Download`s stays distinguishable to a screen reader.
 */
function Action({
  label,
  ariaLabel,
  icon,
  onClick,
  href,
  disabled,
  destructive,
}: {
  label: string;
  ariaLabel?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const className = `inline-flex items-center gap-1.5 rounded-md px-2 py-1 type-support whitespace-nowrap text-muted transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none disabled:opacity-50 ${
    destructive ? 'hover:text-danger' : 'hover:text-strong'
  }`;

  return href ? (
    <a
      href={href}
      aria-label={ariaLabel ?? label}
      download
      className={className}
    >
      {icon}
      {label}
    </a>
  ) : (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {icon}
      {label}
    </button>
  );
}
