'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useDialog } from '@/lib/client/use-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/client/mutations';
import {
  documentOpens,
  formatCompact,
  formatCurrency,
  parseTermsDays,
} from '@stint/core';
import {
  Check,
  DollarSign,
  Download,
  FolderInput,
  Inbox as InboxIcon,
  Pencil,
  Send,
} from 'lucide-react';
import {
  api,
  type InvoiceStatus,
  type SettingsInput,
  type Stats,
  type TimeEntry,
} from '@/lib/client/api';
import { useExit } from '@/lib/client/use-exit';
import { timeZone as tz } from '@/lib/client/use-timer';
import { EntryDialog } from './entry-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RateInput, isValidRate, parseRate } from './rate-input';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

type Attention = Stats['attention'];

/** How many rows the Inbox holds: its header's count and the folded dock's. */
export function inboxCount(attention: Attention) {
  return (
    (attention.noDefaultRate ? 1 : 0) +
    (attention.paymentTermsToCheck !== null ? 1 : 0) +
    attention.overdueInvoices.length +
    attention.staleDrafts.length +
    attention.lateEntries.length +
    attention.unprojected.length +
    attention.strangeDurations.length +
    attention.overlaps.length
  );
}

/** A row, tagged with which list it came from — the tag decides how it renders. */
type InboxRow =
  | { id: string; kind: 'overdue'; row: Attention['overdueInvoices'][number] }
  | { id: string; kind: 'draft'; row: Attention['staleDrafts'][number] }
  | { id: string; kind: 'late'; row: Attention['lateEntries'][number] }
  | { id: string; kind: 'unprojected'; row: Attention['unprojected'][number] }
  | { id: string; kind: 'strange'; row: Attention['strangeDurations'][number] }
  | { id: string; kind: 'overlap'; row: Attention['overlaps'][number] }
  | { id: 'rate'; kind: 'rate' }
  | { id: 'terms'; kind: 'terms'; text: string };

/**
 * The dock's inbox: everything that wants a decision, in one fixed place.
 *
 * **It is always here, including when it is empty.** An inbox is a place, and
 * a dock region is furniture — "Nothing needs you" is information.
 *
 * **Not a card.** The dock is already the container; a second one inside it
 * spends the column's width on nesting.
 *
 * **No snooze.** A row hidden while its condition still holds teaches
 * dismissal by reflex. "It's correct" is not a snooze: it is an answer about
 * one record, stored on it as `duration_ok`.
 *
 * **Nothing destructive but the timer's Discard.** Voiding or deleting an
 * invoice happens on its page, where the whole document is in view; Mark paid
 * and Mark sent are here because they are what legitimately clears a row.
 */
export function Inbox({ stats }: { stats: Stats }) {
  const {
    overdueInvoices,
    staleDrafts,
    lateEntries,
    unprojected,
    strangeDurations,
    overlaps,
  } = stats.attention;
  const queryClient = useQueryClient();

  const exit = useExit();

  // The entry, not its id: saving drops it from the query that supplied it.
  const assigning = useDialog<{
    entry: TimeEntry;
    focus: 'task' | 'project';
  }>();

  /* `EntryDialog` edits a whole entry, which the stats rows do not carry, so
     opening one fetches it by id. The row says which field it is about, and
     the cursor opens there. */
  /* A read, but through the helper so a failure (the entry deleted
     elsewhere, the network gone) is explained rather than a click that does
     nothing. */
  const { mutate: openEntry } = useOptimisticMutation({
    queryKey: ({ id }: { id: string; focus: 'task' | 'project' }) =>
      keys.entry(id),
    mutationFn: ({ id }) =>
      queryClient.fetchQuery({
        queryKey: keys.entry(id),
        queryFn: () => api.entry(id),
      }),
    invalidate: () => undefined,
    onSuccess: (found, { focus }) => {
      assigning.show({ entry: found, focus });
    },
  });

  /* An answered row leaves at once. The refetch that drops it from the data
     waits for its exit, so the animation has a row to play on; a rejection
     brings it back. */
  const leaving = useRef(new Map<string, Promise<void>>()).current;
  const leave = (id: string) => {
    leaving.set(id, exit.mark(id));
  };
  const rowPress = {
    queryKey: () => keys.stats(),
    onError: (_e: Error, vars: string | { id: string }) =>
      exit.unmark(typeof vars === 'string' ? vars : vars.id),
  };

  /* "It's correct" answers the question and nothing else — it never edits the
     times. A trigger clears the answer if they change later. */
  const confirmLength = useOptimisticMutation({
    ...rowPress,
    mutationFn: (id: string) => api.updateEntry(id, { durationOk: true }),
    invalidate: async (qc, id) => {
      await leaving.get(id);
      return invalidateEntryData(qc);
    },
  });

  /* Deduped against Home's identical query, so the one screen rendering both
     makes no second request. */
  const { data: projects = [] } = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
    select: (r) => r.projects,
  });

  /* The PDF is the paid tier, and the server refuses it to a free user. The
     rows don't carry the plan each invoice was generated on, so a free user
     loses the shortcut even for one generated while paying; its page still
     offers the download. Unknown counts as open: the server decides. */
  const { data: billing } = useQuery({
    queryKey: keys.billing(),
    queryFn: api.billing,
  });
  const downloads =
    !billing || documentOpens(billing.available, billing.plan, null);

  const setStatus = useOptimisticMutation({
    ...rowPress,
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      api.updateInvoiceStatus(id, { status }),
    invalidate: async (qc, { id }) => {
      await leaving.get(id);
      return Promise.all([
        qc.invalidateQueries({ queryKey: keys.invoices() }),
        invalidateEntryData(qc),
      ]);
    },
  });

  /* A settings question answered in place: the default rate prices every
     figure on Home, so they all go. The row comes back holding what was
     typed, so it says why itself. */
  const answer = useOptimisticMutation({
    queryKey: () => keys.stats(),
    onError: (_, { id }) => exit.unmark(id),
    inline: true,
    mutationFn: ({ patch }: { id: SettingsRowId; patch: SettingsInput }) =>
      api.updateSettings(patch),
    invalidate: async (qc, { id }) => {
      await leaving.get(id);
      return Promise.all([
        qc.invalidateQueries({ queryKey: keys.settings() }),
        invalidateEntryData(qc),
      ]);
    },
  });
  const answered = (id: SettingsRowId) =>
    answer.variables?.id === id ? answer.error?.message : undefined;

  /* The order is this concatenation. Overdue sorts first and carries danger;
     every other row is neutral. Never the accent — that belongs to the
     running timer. */
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
    /* Money no invoice holds, beside the invoices: work dated in a period
       already sent. */
    ...lateEntries.map((e) => ({
      id: `late:${e.entryId}`,
      kind: 'late' as const,
      row: e,
    })),
    /* A chore like a draft, so it sits with them, above the entry rows: the
       rate is what prices every one of those entries. */
    ...(stats.attention.noDefaultRate
      ? [{ id: 'rate' as const, kind: 'rate' as const }]
      : []),
    ...(stats.attention.paymentTermsToCheck !== null
      ? [
          {
            id: 'terms' as const,
            kind: 'terms' as const,
            text: stats.attention.paymentTermsToCheck,
          },
        ]
      : []),
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
    /* Keyed by the pair: one entry can overlap several, and an entry here can
       also be a strange-duration row above. */
    ...overlaps.map((o) => ({
      id: `overlap:${o.entryId}:${o.otherEntryId}`,
      kind: 'overlap' as const,
      row: o,
    })),
  ];

  const count = inboxCount(stats.attention);

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
        {/* A pill on the same fill the cards use, so the header reads as
            naming the set below it. No badge color — at zero the slot is
            empty, because "Nothing needs you" already says it. */}
        {count ? (
          <span className="inline-flex h-[17px] min-w-[17px] flex-none items-center justify-center rounded-full bg-surface-elevated px-1.5 type-meta text-primary">
            {count}
          </span>
        ) : null}
      </header>

      {count === 0 ? (
        <p className="px-1 py-3 type-support text-subtle">Nothing needs you.</p>
      ) : (
        /* 6px between cards is a margin on the card, not a `gap` on this
           list: a flex gap belongs to the container and survives a row
           collapsing, so a departing card would leave its gap behind. */
        <ul className="flex flex-col">
          {rows.map((r) =>
            r.kind === 'rate' ? (
              <SettingsRow
                key={r.id}
                label="Set your default rate"
                detail="Home can't show money without one"
                input={(p) => (
                  <RateInput
                    {...p}
                    aria-label="Default hourly rate"
                    placeholder="100.00"
                  />
                )}
                initial=""
                parse={(text) => {
                  const rate = parseRate(text);
                  return isValidRate(rate) ? rate : null;
                }}
                invalid="A rate is a number, zero or more."
                onSubmit={(defaultHourlyRate) => {
                  leave(r.id);
                  answer.mutate({ id: r.id, patch: { defaultHourlyRate } });
                }}
                error={answered(r.id)}
                exiting={exit.exiting.has(r.id)}
                ref={exit.register(r.id)}
              />
            ) : r.kind === 'terms' ? (
              <SettingsRow
                key={r.id}
                label="Check your payment terms"
                detail={`You wrote “${r.text}”. Invoices now print Net 30.`}
                input={(p) => (
                  <Input
                    {...p}
                    aria-label="Payment terms in days"
                    inputMode="numeric"
                  />
                )}
                initial="30"
                parse={parseTermsDays}
                invalid="Whole days, 0 to 365."
                onSubmit={(paymentTermsDays) => {
                  leave(r.id);
                  answer.mutate({ id: r.id, patch: { paymentTermsDays } });
                }}
                error={answered(r.id)}
                exiting={exit.exiting.has(r.id)}
                ref={exit.register(r.id)}
              />
            ) : (
              <Row
                key={r.id}
                entry={r}
                downloads={downloads}
                onStatus={(v) => {
                  leave(v.id);
                  setStatus.mutate(v);
                }}
                onOpen={openEntry}
                onConfirm={(id) => {
                  leave(id);
                  confirmLength.mutate(id);
                }}
                exiting={exit.exiting.has(r.id)}
                ref={exit.register(r.id)}
              />
            ),
          )}
        </ul>
      )}

      <EntryDialog
        open={assigning.open}
        onOpenChange={assigning.onOpenChange}
        existing={assigning.subject?.entry}
        focus={assigning.subject?.focus}
        projects={projects}
        /* The row's id IS the entry id for both kinds that open this dialog,
           so the mark lands on the row the user just answered. */
        onSaved={exit.mark}
      />
    </section>
  );
}

type SettingsRowId = Extract<InboxRow, { kind: 'rate' | 'terms' }>['id'];

/** A settings row holds a form's state, so it is its own component. */
type ItemRow = Exclude<InboxRow, { kind: SettingsRowId }>;

type Handlers = {
  downloads: boolean;
  onStatus: (v: { id: string; status: InvoiceStatus }) => void;
  onOpen: (v: { id: string; focus: 'task' | 'project' }) => void;
  onConfirm: (id: string) => void;
};

type ItemProps = Omit<React.ComponentProps<typeof Item>, 'exiting' | 'ref'>;

function Row({
  entry,
  exiting,
  ref,
  ...handlers
}: Handlers & {
  entry: ItemRow;
  exiting: boolean;
  ref: React.Ref<HTMLLIElement>;
}) {
  return <Item exiting={exiting} ref={ref} {...itemFor(entry, handlers)} />;
}

/** Which `Item` a row becomes — the one place the five kinds differ. */
function itemFor(r: ItemRow, h: Handlers): ItemProps {
  switch (r.kind) {
    case 'overdue':
      return invoiceItem(r.row, h, {
        detail: `${r.row.daysLate} ${r.row.daysLate === 1 ? 'day' : 'days'} late`,
        tone: 'danger',
        status: 'paid',
      });
    case 'draft':
      return invoiceItem(r.row, h, {
        detail: `Draft, ${r.row.ageDays}d old`,
        tone: 'neutral',
        status: 'sent',
      });
    case 'unprojected':
      return unprojectedItem(r.row, h);
    case 'overlap':
      return overlapItem(r.row, h);
    case 'late':
      return lateItem(r.row, h);
    case 'strange':
      return strangeItem(r.row, h);
  }
}

/* A currency glyph for paid, not a check: the check belongs to "It's
   correct". */
const MARK = {
  paid: { label: 'Mark paid', icon: <DollarSign aria-hidden /> },
  sent: { label: 'Mark sent', icon: <Send aria-hidden /> },
} as const;

function invoiceItem(
  i: Attention['overdueInvoices'][number] | Attention['staleDrafts'][number],
  h: Handlers,
  {
    detail,
    tone,
    status,
  }: Pick<ItemProps, 'detail' | 'tone'> & { status: keyof typeof MARK },
): ItemProps {
  return {
    href: `/invoices/${i.invoiceId}`,
    label: i.clientName ?? i.invoiceNumber,
    detail,
    value: formatCurrency(i.amount, i.currency),
    tone,
    actions: (
      <>
        <Action
          label={MARK[status].label}
          ariaLabel={`Mark ${i.invoiceNumber} ${status}`}
          icon={MARK[status].icon}
          onClick={() => h.onStatus({ id: i.invoiceId, status })}
        />
        {h.downloads ? (
          <Action
            label="Download"
            ariaLabel={`Download ${i.invoiceNumber}`}
            icon={<Download aria-hidden />}
            href={api.invoicePdfUrl(i.invoiceId)}
          />
        ) : null}
      </>
    ),
  };
}

function entryItem(
  e: { entryId: string; taskName: string; seconds: number },
  h: Handlers,
  {
    focus,
    detail,
    tone,
    action,
    more,
  }: Pick<ItemProps, 'detail' | 'tone'> & {
    focus: 'task' | 'project';
    action: { label: string; ariaLabel: string; icon: React.ReactNode };
    more?: React.ReactNode;
  },
): ItemProps {
  const open = () => h.onOpen({ id: e.entryId, focus });
  return {
    onSelect: open,
    label: e.taskName || 'Untitled entry',
    detail,
    value: formatCompact(e.seconds),
    tone,
    actions: (
      <>
        <Action {...action} onClick={open} />
        {more}
      </>
    ),
  };
}

/* One row per entry, not a rollup: the work is done an entry at a time —
   open it, assign a project, move to the next. It edits in place because
   these entries scatter across days, and a trip to the calendar for each
   would lose the list. */
function unprojectedItem(u: Attention['unprojected'][number], h: Handlers) {
  return entryItem(u, h, {
    focus: 'project',
    detail: `No project · ${dayLabel(u.startedAt, tz)}`,
    tone: 'neutral',
    action: {
      label: 'Assign project',
      ariaLabel: `Assign a project to ${u.taskName || 'this entry'}`,
      icon: <FolderInput aria-hidden />,
    },
  });
}

const editEntry = (taskName: string) => ({
  label: 'Edit entry',
  ariaLabel: `Edit ${taskName || 'this entry'}`,
  icon: <Pencil aria-hidden />,
});

/* The pair's unbilled entry is opened — the later one when both are, as it
   started inside the other. A billed other is named by its invoice, since
   it can't be edited. Resolved by editing, never by an "it's fine": two
   entries billing the same minutes cannot both be right. */
function overlapItem(o: Attention['overlaps'][number], h: Handlers) {
  const invoice = o.otherInvoiceNumber ? ` on ${o.otherInvoiceNumber}` : '';
  return entryItem(o, h, {
    focus: 'task',
    detail: `Overlaps ${o.otherTaskName || 'another entry'}${invoice} · ${dayLabel(o.startedAt, tz)}`,
    tone: 'warning',
    action: editEntry(o.taskName),
  });
}

/* Billed nowhere, and never moved onto the next invoice unasked: the
   entry opens, where it can be marked not billable, or it waits for a later
   invoice. */
function lateItem(e: Attention['lateEntries'][number], h: Handlers) {
  return entryItem({ ...e, seconds: Math.round(e.hours * 3600) }, h, {
    focus: 'task',
    detail: [
      e.clientName,
      dayLabel(e.startedAt, tz),
      `in ${e.invoiceNumber}'s period, already sent`,
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'warning',
    action: editEntry(e.taskName),
  });
}

/* The qualifier names which threshold it tripped, because color alone never
   says which way. */
function strangeItem(e: Attention['strangeDurations'][number], h: Handlers) {
  return entryItem(e, h, {
    focus: 'task',
    detail: [
      e.clientName ?? e.projectName,
      dayLabel(e.startedAt, tz),
      e.kind === 'short' ? 'unusually short' : 'unusually long',
    ]
      .filter(Boolean)
      .join(' · '),
    tone: 'warning',
    action: editEntry(e.taskName),
    /* The one action that means "this is already right", and the only one
       wearing a check mark. */
    more: (
      <Action
        label="It's correct"
        ariaLabel={`Keep ${e.taskName || 'this entry'} as it is`}
        icon={<Check aria-hidden />}
        onClick={() => h.onConfirm(e.entryId)}
      />
    ),
  });
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
 * texture, and the danger one in it is conspicuous. Color never carries the
 * meaning alone; the qualifier states it in words.
 */
function Item({
  href,
  onSelect,
  label,
  detail,
  value,
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
  /** The figure beside the detail. The rate row has none: it asks for one. */
  value?: string;
  /**
   * How urgent the row is, and the ONLY thing on the card that takes color.
   * It paints a 2px edge inside the card and the clause of `detail` that
   * names the fault — one value, so the two cannot disagree.
   *
   * `danger` is the overdue invoice, where money is already late. `warning`
   * is a length that wants a look. `neutral` draws nothing: a stale draft and
   * an unprojected entry are chores, and five flagged cards are a texture
   * with nothing to pick out of it.
   */
  tone: 'danger' | 'warning' | 'neutral';
  actions?: React.ReactNode;
  /** From `useExit` — the row collapses while its exit plays. */
  exiting?: boolean;
  ref?: React.Ref<HTMLLIElement>;
}) {
  /* Always `text-strong`: the edge ranks the row, and a column of colored
     headlines reads as an outage. */
  const titleClass =
    'block truncate text-left rounded-sm type-control text-strong hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

  /* The edge is drawn by a pseudo-element inside the card rather than a
     border, so it ranks the card without insetting its content. */
  const edge =
    tone === 'danger'
      ? 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-danger'
      : tone === 'warning'
        ? 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-timer-warning'
        : '';

  return (
    /* The collapsing wrapper is the `li` and the padded box is inside it, so
       the grid track has something to shrink. `exit-collapse` zeroes that
       box's padding too — a `0fr` track still floors at min-content. */
    <li
      ref={ref}
      className="exit-collapse [&:not(:first-child)>*]:mt-1.5"
      data-exiting={exiting ? '' : undefined}
    >
      <div
        /* A card: its own surface, no border on any edge. The dock's ground
           is the plane below it, so depth says where the card ends — which
           is the job the old colored rule was standing in for. */
        data-tone={tone}
        className={`group relative overflow-hidden rounded-lg bg-surface-elevated px-2.5 py-2.5 shadow-card transition-colors hover:bg-surface-hover ${edge}`}
      >
        {/* The title owns its line. It is the subject of the row, and a
            figure sharing the line takes width from it in proportion to how
            much money the row is about. */}
        {href ? (
          <Link href={href} prefetch className={titleClass}>
            {label}
          </Link>
        ) : onSelect ? (
          <button type="button" onClick={onSelect} className={titleClass}>
            {label}
          </button>
        ) : (
          /* Plain text where there is nothing to open — a running timer has
             no record yet. */
          <span className={`${titleClass} hover:no-underline`}>{label}</span>
        )}

        {/* The figure is a fact ABOUT the subject, so it sits beside the
            qualifier and the two read as one statement. */}
        <div className="mt-0.5 flex items-baseline gap-1.5 text-subtle">
          {value ? (
            <>
              <span
                className={`flex-none text-primary ${
                  value.startsWith('$') ? 'type-amount' : 'type-duration'
                }`}
              >
                {value}
              </span>
              <span
                aria-hidden
                className="size-0.5 flex-none rounded-full bg-edge-control"
              />
            </>
          ) : null}
          {/* Wraps rather than truncating: it names which threshold was
              tripped, and an ellipsis eating "over 8h" takes the half of the
              signal that color cannot carry. */}
          <span
            className={`min-w-0 type-support ${
              tone === 'danger'
                ? 'text-danger'
                : tone === 'warning'
                  ? 'text-warning'
                  : 'text-muted'
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
 * The row's actions — always drawn.
 *
 * **Nothing fades in.** A slot reserving height for controls nobody can see
 * costs the same space as drawing them, and a touch device has no hover to
 * reveal them with.
 */
function ActionSlot({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex items-center gap-1.5">{children}</div>;
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
}: {
  label: string;
  ariaLabel?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  return href ? (
    <Button asChild size="xs">
      <a href={href} aria-label={ariaLabel ?? label} download>
        {icon}
        {label}
      </a>
    </Button>
  ) : (
    <Button
      type="button"
      size="xs"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

/**
 * A setting the Inbox asks for, answered here rather than in Settings, since
 * this is where the question is asked: the default rate while there is none,
 * or payment terms the move to days couldn't read.
 */
function SettingsRow({
  label,
  detail,
  input,
  initial,
  parse,
  invalid,
  onSubmit,
  error,
  exiting,
  ref,
}: {
  label: string;
  detail: string;
  input: (props: React.ComponentProps<'input'>) => React.ReactNode;
  initial: string;
  parse: (text: string) => number | null;
  /** Said under the field while what's typed doesn't parse. */
  invalid: string;
  onSubmit: (value: number) => void;
  /** The server's refusal of the last save, shown once the row is back. */
  error?: string;
  exiting: boolean;
  ref: React.Ref<HTMLLIElement>;
}) {
  const [text, setText] = useState(initial);
  const value = parse(text);
  const shown = text !== '' && value === null ? invalid : error;

  return (
    <Item
      exiting={exiting}
      ref={ref}
      label={label}
      detail={detail}
      tone="neutral"
      actions={
        <form
          className="flex w-full flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (value !== null) onSubmit(value);
          }}
        >
          <div className="flex items-center gap-1.5">
            {input({
              className: 'flex-1',
              'aria-invalid': shown ? true : undefined,
              value: text,
              onChange: (e) => setText(e.target.value),
            })}
            <Button type="submit" size="xs" disabled={value === null}>
              Save
            </Button>
          </div>
          {shown ? (
            <p role="alert" className="type-support text-danger">
              {shown}
            </p>
          ) : null}
        </form>
      }
    />
  );
}
