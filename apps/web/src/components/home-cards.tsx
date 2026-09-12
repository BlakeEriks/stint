'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatCompact } from '@stint/core';
import { ArrowRight, BarChart3, type LucideIcon, Wallet } from 'lucide-react';
import { api, type Stats } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';
import { money } from './invoice-bits';
/* `activity-strip.tsx` — the twelve-week heatmap this replaced — is still in
   the tree and still tested. It is left there on purpose: the chart answers
   the same question and should prove itself over a week of real use before
   the strip is deleted. Deleting it is one line later; rebuilding it is not. */
import { ActivityChart } from './activity-chart';

/**
 * The home screen's card set.
 *
 * Toggl's dashboard answers "how did I spend my time?", which a solo
 * contractor already knows — they were there. These answer the questions you
 * genuinely cannot answer from memory: how much money is sitting unbilled, is
 * anything about to go wrong, and am I on pace.
 *
 * Order is money waiting, money coming, then texture. **Nothing here writes**
 * any more: every card reads, and every action is a link to the surface that
 * owns the mutation, because a dashboard that edits data turns a stray click
 * into a changed invoice.
 *
 * That used to be narrowly untrue — marking an invoice paid or sent was
 * offered inline, because it was the action that cleared an attention row.
 * Those rows are the dock's inbox now (`inbox.tsx`), and the writes went with
 * them, so the broad rule holds again on this screen.
 *
 * No card carries the accent. On this screen the accent is spent, and it is
 * spent on the running timer in the bar below.
 */
export function HomeCards() {
  const tz = useTimeZone();
  const { data } = useQuery({
    queryKey: ['stats', tz],
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  /* Both cards hide themselves — Unbilled with nothing outstanding, Pace with
     no monthly target — so the layout asks what is present before splitting.
     A fixed `grid-cols-2` would leave a visible hole on an ordinary day,
     which is worse than the single column it replaced.

     The inbox is NOT here. It belongs to the dock at every width; Home
     briefly carried a copy below `xl`, which meant the same content appeared
     under two names with two empty-state behaviours and renamed itself as you
     resized across 1280px. */
  const hasUnbilled = data.unbilled.byClient.length > 0;
  const hasPace = data.pace != null;
  const splitColumns = hasUnbilled && hasPace;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {splitColumns ? (
        /* 1.6fr / 1fr, not equal columns. The left column is rows of client
           names, ages, hours and amounts — content that grows and truncates
           when starved. The right is a number and a bar, which does not get
           better with more room. Equal columns would starve the side with
           something to say to pad the side without.

           `items-start` so a short right column does not stretch its cards to
           match a tall left one. */
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-4">
            <Unbilled stats={data} />
          </div>
          <div className="flex flex-col gap-4">
            <Pace stats={data} />
          </div>
        </div>
      ) : (
        <>
          {hasUnbilled ? <Unbilled stats={data} /> : null}
          {hasPace ? <Pace stats={data} /> : null}
        </>
      )}

      {/* Full width, below the money and above Today.

          It wants the room — 30 bars in a narrow column is a smear — but it
          is texture rather than money: how the work felt, which the user was
          there for. Needs attention and Unbilled are the things they cannot
          recall, so those keep the top-left where the eye lands first. Making
          the chart dominant would put the most decorative card in the most
          valuable position. */}
      <ActivityChart />
    </div>
  );
}

/**
 * Money waiting — the headline number, and the reason this screen exists.
 *
 * Never labelled "earned" or "revenue": it is work done and not yet invoiced,
 * money the user might still never see. Overstating it in a billing tool is
 * the same trust failure as silently editing an entry.
 */
function Unbilled({ stats }: { stats: Stats }) {
  const { total, byClient, moreClients } = stats.unbilled;
  if (byClient.length === 0) return null;

  return (
    <Card title="Unbilled" icon={Wallet} value={money(total, stats.currency)}>
      <ul className="flex flex-col">
        {byClient.map((c) => (
          <Row
            key={c.clientId ?? 'none'}
            // Links to generation for this client, which is what makes the
            // card an action rather than a readout.
            href={
              c.clientId
                ? `/invoices/new?clientId=${c.clientId}`
                : '/invoices/new'
            }
            label={c.clientName}
            detail={
              c.unratedCount > 0
                ? `oldest ${c.oldestDays}d · ${c.unratedCount} unrated`
                : `oldest ${c.oldestDays}d`
            }
            value={
              /* Unbillable work has no rate by definition; an em-dash is
                 honest where a zero would look like a real figure. */
              c.amount > 0 ? money(c.amount, c.currency) : '—'
            }
            secondary={formatCompact(c.seconds)}
          />
        ))}
      </ul>
      {moreClients > 0 ? (
        <p className="px-4 py-2 type-support text-subtle">
          +{moreClients} more
        </p>
      ) : null}

      {/* One line, not a card and not a row per invoice. A row each would put
          ordinary, nothing-is-wrong invoices back on the home screen and undo
          the overdue grace period under a calmer heading; reconciling several
          at once belongs on /invoices, which is a list.

          Never added to the total above: that is work not yet invoiced, this
          is money already asked for, and summing them double-counts. */}
      {stats.awaitingPayment > 0 ? (
        <Link
          href="/invoices?status=sent"
          className="flex items-baseline gap-1.5 border-t border-edge-subtle px-4 py-2 type-support text-subtle hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
        >
          <span className="type-meta text-muted">
            {money(stats.awaitingPayment, stats.currency)}
          </span>
          sent, awaiting payment
        </Link>
      ) : null}
    </Card>
  );
}

/**
 * Month to date against the target.
 *
 * The whole card hides when no target is set: an empty progress bar asking to
 * be configured is a chore the app assigned itself.
 */
function Pace({ stats }: { stats: Stats }) {
  const p = stats.pace;
  if (!p) return null;

  const ratio =
    p.actual != null && p.target > 0 ? Math.min(1, p.actual / p.target) : 0;

  /* "On pace" is derived from BUSINESS days elapsed, not calendar days: a
     120-hour target is six hours a working day, and reading "behind" on a
     Monday because the weekend passed would be noise pretending to be
     signal. */
  const ahead = p.delta != null && p.delta >= 0;

  /* No figure yet means no subject, so the card keeps a heading rather than
     demoting its title above an empty space. */
  if (p.actual == null) {
    return (
      <Card title={monthName()} icon={BarChart3}>
        <div className="px-4 pt-3.5 pb-3">
          <p className="type-support text-subtle">
            A {p.unit} target is set, but pace in {p.unit} is not computed yet.
          </p>
        </div>
      </Card>
    );
  }

  const actual = p.actual;

  return (
    <Card
      title={monthName()}
      icon={BarChart3}
      value={
        <>
          {actual.toFixed(1)}h
          {/* The target is context for the figure, not part of it, so it is
              set at row scale rather than carried along at 30px. */}
          <span className="type-duration text-subtle">
            {' / '}
            {p.target}h
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-3">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-hover"
          role="img"
          aria-label={`${actual.toFixed(1)} of ${p.target} hours`}
        >
          {/* Neutral, not accent: the accent is the running timer. */}
          <div
            className="h-full rounded-full bg-text-subtle"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <p className="type-support text-subtle">
            {p.businessDaysElapsed} of {p.businessDaysTotal} business days
            {stats.billableRatio != null
              ? ` · ${Math.round(stats.billableRatio * 100)}% billable`
              : null}
          </p>
          <span
            className={`flex-none type-meta ${ahead ? 'text-muted' : 'text-warning'}`}
          >
            {ahead ? 'on pace' : 'behind'}{' '}
            {p.delta != null
              ? `${p.delta >= 0 ? '+' : ''}${p.delta.toFixed(1)}h`
              : null}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ── shared shell ─────────────────────────────────────────────────── */

/**
 * A card, in one of two header modes.
 *
 * **A card whose point is one figure demotes its own title.** Unbilled and
 * Pace exist to show a number; the word only says *which* number, so it drops
 * to a quiet `type-label` above a `type-figure` that the eye actually lands
 * on. **A card whose point is a list keeps its heading**, because there is no
 * single figure to be the subject and a demoted title would leave the card
 * with no entry point at all.
 *
 * Passing `value` selects the first mode. That is the whole rule, and it is
 * deliberately not a free choice per card: uniform headers are most of why
 * the screen read flat, but headers styled ad hoc would be worse than
 * uniform.
 */
function Card({
  title,
  icon: Icon,
  iconTone,
  value,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /* Neutral unless the card already carries a tone. Only Needs attention
     passes one, because it is the only card that is *about* something being
     wrong — colouring the rest would spend a channel the app uses for meaning
     on decoration. Never the accent: five green glyphs on the one screen the
     accent belongs to the running timer would undo the rule outright. */
  iconTone?: 'warning';
  /** The card's subject. Supplying it demotes the title — see above. */
  value?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (value !== undefined) {
    return (
      <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
        <header className="px-4 pt-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon
              aria-hidden
              strokeWidth={1.75}
              className={`size-3.5 flex-none ${
                iconTone === 'warning' ? 'text-warning' : 'text-subtle'
              }`}
            />
            {/* The title is the label on the number, so it is set as one:
                small, uppercase, wide-tracked mono. `text-subtle` is legal
                here because `type-label` is a non-text UI label rather than
                reading copy — the same pairing every other label in the app
                uses. */}
            <h2 className="type-label truncate text-subtle">{title}</h2>
          </div>
          {/* The subject of the card, and much larger than the rows beneath
              it. Uniform type is what made the screen read as strata; this is
              the one place per card where size is allowed to say "start
              here". */}
          <div className="mt-1.5 type-figure text-strong">{value}</div>
        </header>
        <div className="mx-4 border-t border-edge-subtle" />
        {children}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
      {/* The rule is INSET to the same `px-4` the rows use, not a border on
          the header itself.

          A `border-b` here would run the full width of the card and cut the
          panel in two, which reads as two stacked cards rather than one with
          a header. Held to the content's own left and right edges it reads as
          part of the column — the same reason the rows are padded, applied to
          the line that separates them.

          The icon is centred against the heading inside its own flex row
          rather than dropped into the header directly, where having no text
          baseline of its own would sit it low by roughly its own descender. */}
      <header className="flex items-center gap-2 px-4 pt-3 pb-2.5">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={`size-4 flex-none ${
            iconTone === 'warning' ? 'text-warning' : 'text-muted'
          }`}
        />
        {/* A list card's title is a heading, not a system label — there is no
            figure for it to be subordinate to, so demoting it would leave the
            card with no entry point.

            The icon is `aria-hidden`, so the accessible name stays the
            heading text alone — a screen reader should not announce
            "triangle alert Needs attention". */}
        <h2 className="type-heading truncate text-strong">{title}</h2>
      </header>
      <div className="mx-4 border-t border-edge-subtle" />
      {children}
    </section>
  );
}

function Row({
  href,
  icon,
  label,
  detail,
  value,
  secondary,
  tone,
  actions,
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  detail: string;
  value: string;
  secondary?: string;
  tone?: 'danger' | 'warning';
  actions?: React.ReactNode;
}) {
  /* The row is a grid, not a link wrapping buttons: an <a> containing a
     <button> is invalid HTML and breaks keyboard navigation — Tab would land
     inside the link. The label is the link; the actions sit beside it.

     Sized by CONTAINER, not viewport. The same card renders in Home's wide
     column and in the 280px dock, so a `sm:` breakpoint is the wrong
     question: it is true in the dock at 1600px and lays the row out as though
     there were room. Measured in the dock under the old rules, the label got
     24px while the fixed-width duration kept 96.

     `@container` on the row's own list, so every threshold below reads the
     card's width. */
  return (
    <li className="@container border-t border-edge-subtle first:border-t-0">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        {icon}

        {/* Detail wraps under the label when the card is narrow rather than
            hiding. "12 days late" IS the row — a client name and an amount
            without it is just an invoice, not something needing attention. */}
        <Link
          href={href}
          className="flex min-w-0 flex-1 flex-col rounded-sm hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none @md:flex-row @md:items-baseline @md:gap-2.5"
        >
          <span className="truncate type-control text-primary">{label}</span>
          <span
            className={`truncate type-meta ${
              tone === 'danger'
                ? 'text-danger'
                : tone === 'warning'
                  ? 'text-warning'
                  : 'text-subtle'
            }`}
          >
            {detail}
          </span>
        </Link>

        {/* Hours are supporting detail, and the first thing to go: the amount
            is what the row is for. */}
        {secondary ? (
          <span className="hidden w-16 flex-none text-right type-meta text-subtle @md:inline">
            {secondary}
          </span>
        ) : null}
        {/* Auto-width in a narrow card. The fixed `w-24` exists so the
            amounts form a column when there is room for one; in the dock it
            was reserving a quarter of the card for six characters. */}
        <span className="flex-none text-right type-duration text-primary @md:w-24">
          {value}
        </span>

        {actions ? (
          <span className="flex flex-none items-center gap-1">{actions}</span>
        ) : (
          <ArrowRight aria-hidden className="size-3.5 flex-none text-subtle" />
        )}
      </div>
    </li>
  );
}

function monthName() {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
}
