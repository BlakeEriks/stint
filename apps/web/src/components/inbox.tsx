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
import { useExit } from '@/lib/client/use-exit';
import { RUNAWAY_ROW_ID, useRunaway } from '@/lib/client/use-runaway';
import { timeZone as tz } from '@/lib/client/use-timer';
import { EntryDialog } from './entry-dialog';
import { formatCurrency } from './invoice-bits';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

type Attention = Stats['attention'];

/** A row, tagged with which list it came from — the tag decides how it renders. */
type InboxRow =
  | { id: string; kind: 'overdue'; row: Attention['overdueInvoices'][number] }
  | { id: string; kind: 'draft'; row: Attention['staleDrafts'][number] }
  | { id: string; kind: 'unprojected'; row: Attention['unprojected'][number] }
  | { id: string; kind: 'strange'; row: Attention['strangeDurations'][number] };

/**
 * The dock's inbox: everything that wants a decision, in one fixed place.
 *
 * **It is always here, including when it is empty.** An inbox is a place, and
 * a dock region is furniture — "Nothing needs you" is information.
 *
 * **Not a card.** The dock is already the container; a second one inside it
 * spends the column's width on nesting.
 */
export function Inbox({ stats }: { stats: Stats }) {
  const { overdueInvoices, staleDrafts, unprojected, strangeDurations } =
    stats.attention;
  const queryClient = useQueryClient();

  const exit = useExit();
  const runaway = useRunaway(exit.mark);

  /* The ENTRY being edited, not its id: saving moves the entry out of the
     query that supplied it, so an id would still say "open" over nothing and
     the editor would reopen as a blank "Add entry". */
  const [assigning, setAssigning] = useState<TimeEntry | undefined>();
  const [focusField, setFocusField] = useState<'task' | 'project'>('task');

  /* `EntryDialog` edits a whole entry, which the stats rows do not carry, so
     opening one fetches it by id. The row says which field it is about, and
     the cursor opens there. */
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
    onSuccess: async (_r, id) => {
      await exit.mark(id);
      invalidateEntryData(queryClient);
    },
  });

  /* Deduped against Home's identical query, so the one screen rendering both
     makes no second request. */
  const { data: projects = [] } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
    select: (r) => r.projects,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      api.updateInvoiceStatus(id, { status }),
    onSuccess: async (_r, { id }) => {
      await exit.mark(id);
      queryClient.invalidateQueries({ queryKey: keys.invoices() });
      invalidateEntryData(queryClient);
    },
  });

  /* The order is this concatenation. Overdue sorts first among the invoices
     and carries danger; everything else is a warning. Never the accent —
     that belongs to the running timer. */
  const rows: InboxRow[] = [
    ...overdueInvoices.map((i) => ({
      id: i.invoiceId,
      kind: 'overdue' as const,
      row: i,
    })),
    ...staleDrafts.map((d) => ({
      id: d.invoiceId,
      kind: 'draft' as const,
      row: d,
    })),
    ...unprojected.map((u) => ({
      id: u.entryId,
      kind: 'unprojected' as const,
      row: u,
    })),
    ...strangeDurations.map((e) => ({
      id: e.entryId,
      kind: 'strange' as const,
      row: e,
    })),
  ];

  const count = rows.length + (runaway.showing ? 1 : 0);

  return (
    <section aria-label="Inbox">
      <header className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <InboxIcon
            aria-hidden
            strokeWidth={1.75}
            className="size-3.5 flex-none text-subtle"
          />
          <h2 className="type-label truncate text-subtle">Inbox</h2>
        </div>
        {/* The count is the whole status — no badge colour. At zero the slot
            is empty: "Nothing needs you" below already says it, and the count
            is a count. */}
        <span className="type-meta text-subtle">{count || null}</span>
      </header>

      {count === 0 ? (
        <p className="px-1 py-3 type-support text-subtle">Nothing needs you.</p>
      ) : (
        <ul className="flex flex-col">
          {/* The runaway sorts first: it is the only row whose subject is still
              changing while you read it. */}
          {runaway.showing ? (
            <RunawayItem
              runaway={runaway}
              exiting={exit.exiting.has(RUNAWAY_ROW_ID)}
              ref={exit.register(RUNAWAY_ROW_ID)}
            />
          ) : null}

          {rows.map((r) => (
            <Row
              key={r.id}
              entry={r}
              busy={setStatus.isPending}
              confirming={confirmLength.isPending}
              onStatus={setStatus.mutate}
              onOpen={openEntry}
              onConfirm={confirmLength.mutate}
              exiting={exit.exiting.has(r.id)}
              ref={exit.register(r.id)}
            />
          ))}
        </ul>
      )}

      {/* Its own instance: this and the timer bar open the dialog on different
          subjects and never open together. */}
      <EntryDialog
        open={assigning !== undefined}
        onOpenChange={(o) => {
          if (!o) setAssigning(undefined);
        }}
        existing={assigning}
        focus={focusField}
        projects={projects}
        /* The row's id IS the entry id for both kinds that open this dialog,
           so the mark lands on the row the user just answered. */
        onSaved={exit.mark}
      />
    </section>
  );
}

/** Which `Item` a row becomes — the one place the four kinds differ. */
function Row({
  entry,
  busy,
  confirming,
  onStatus,
  onOpen,
  onConfirm,
  ...leaving
}: {
  entry: InboxRow;
  busy: boolean;
  confirming: boolean;
  onStatus: (v: { id: string; status: InvoiceStatus }) => void;
  onOpen: (v: { id: string; focus: 'task' | 'project' }) => void;
  onConfirm: (id: string) => void;
  exiting: boolean;
  ref: React.Ref<HTMLLIElement>;
}) {
  const r = entry;

  if (r.kind === 'overdue') {
    const i = r.row;
    return (
      <Item
        {...leaving}
        href={`/invoices/${i.invoiceId}`}
        label={i.clientName ?? i.invoiceNumber}
        detail={`${i.daysLate} ${i.daysLate === 1 ? 'day' : 'days'} late`}
        value={formatCurrency(i.amount, i.currency)}
        tone="danger"
        actions={
          <>
            {/* A currency glyph, not a check: the check belongs to "It's
                correct". */}
            <Action
              label="Mark paid"
              ariaLabel={`Mark ${i.invoiceNumber} paid`}
              icon={<DollarSign aria-hidden className="size-3.5" />}
              disabled={busy}
              onClick={() => onStatus({ id: i.invoiceId, status: 'paid' })}
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
    );
  }

  if (r.kind === 'draft') {
    const d = r.row;
    return (
      <Item
        {...leaving}
        href={`/invoices/${d.invoiceId}`}
        label={d.clientName ?? d.invoiceNumber}
        detail={`Draft, ${d.ageDays}d old`}
        value={formatCurrency(d.amount, d.currency)}
        tone="warning"
        actions={
          <>
            <Action
              label="Mark sent"
              ariaLabel={`Mark ${d.invoiceNumber} sent`}
              icon={<Send aria-hidden className="size-3.5" />}
              disabled={busy}
              onClick={() => onStatus({ id: d.invoiceId, status: 'sent' })}
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
    );
  }

  /* One row per entry, not a rollup: the work is done an entry at a time —
     open it, assign a project, move to the next. */
  if (r.kind === 'unprojected') {
    const u = r.row;
    return (
      <Item
        {...leaving}
        onSelect={() => onOpen({ id: u.entryId, focus: 'project' })}
        label={u.taskName || 'Untitled entry'}
        detail={`No project · ${dayLabel(u.startedAt, tz)}`}
        value={formatCompact(u.seconds)}
        tone="warning"
        actions={
          <Action
            label="Assign project"
            ariaLabel={`Assign a project to ${u.taskName || 'this entry'}`}
            icon={<FolderInput aria-hidden className="size-3.5" />}
            onClick={() => onOpen({ id: u.entryId, focus: 'project' })}
          />
        }
      />
    );
  }

  /* The qualifier names which threshold it tripped, because colour alone never
     says which way. */
  const e = r.row;
  return (
    <Item
      {...leaving}
      onSelect={() => onOpen({ id: e.entryId, focus: 'task' })}
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
            onClick={() => onOpen({ id: e.entryId, focus: 'task' })}
          />
          {/* The one action that means "this is already right", and the only
              one wearing a check mark. */}
          <Action
            label="It's correct"
            ariaLabel={`Keep ${e.taskName || 'this entry'} as it is`}
            icon={<Check aria-hidden className="size-3.5" />}
            disabled={confirming}
            onClick={() => onConfirm(e.entryId)}
          />
        </>
      }
    />
  );
}

/**
 * The runaway timer's row: surfaced here, decided here. Keep / Adjust /
 * Discard stay labelled — three judgements about billable work, and an icon
 * meaning "discard 52 hours" is not one to decode.
 */
function RunawayItem({
  runaway,
  ...leaving
}: {
  runaway: ReturnType<typeof useRunaway>;
  exiting: boolean;
  ref: React.Ref<HTMLLIElement>;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  return (
    <Item
      {...leaving}
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
            {/* Keep is first and plainest: a long timer is often correct, and
                the app must not imply otherwise. */}
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

/** The entry's own day, in the user's zone. */
function dayLabel(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(new Date(iso));
}

/**
 * One inbox row: title and figure, the qualifier, then an action slot.
 *
 * **Severity is the left rule, never a per-row icon** — aligned rules are one
 * texture, and the danger one in it is conspicuous. Colour never carries the
 * meaning alone; the qualifier states it in words.
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
  exiting,
  ref,
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
  /** From `useExit` — the row collapses while its exit plays. */
  exiting?: boolean;
  ref?: React.Ref<HTMLLIElement>;
}) {
  const titleClass =
    'truncate text-left rounded-sm type-control text-strong hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

  return (
    /* The collapsing wrapper is the `li` and the padded box is inside it, so
       the grid track has something to shrink. `exit-collapse` zeroes that
       box's padding too — a `0fr` track still floors at min-content. */
    <li
      ref={ref}
      className="exit-collapse"
      data-exiting={exiting ? '' : undefined}
    >
      <div
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
      </div>
    </li>
  );
}

/**
 * The row's actions, revealed on hover.
 *
 * **The slot is always in flow; only its contents fade.** `display:none` drops
 * it out of flow and the row grows the moment a pointer crosses it.
 *
 * `reveal-on-hover` (globals.css) keeps the buttons visible on touch, where
 * there is no hover.
 */
function ActionSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="reveal-on-hover mt-2 flex min-h-[26px] items-center gap-0.5">
      {children}
    </div>
  );
}

/**
 * An inline action: a label, and an icon no other action uses — the check mark
 * belongs to "It's correct".
 *
 * `aria-label` names the invoice where the visible text is generic, so a column
 * of `Download`s stays distinguishable to a screen reader.
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
