'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatCompact } from '@stint/core';
import {
  ArrowRight,
  BarChart3,
  type LucideIcon,
  Pencil,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { formatCurrency } from './invoice-bits';
import { ActivityChart } from './activity-chart';
import { keys } from '@/lib/client/query-keys';

/**
 * The home screen's card set: money waiting, money coming, then texture.
 *
 * **Nothing here writes.** Every action is a link to the surface that owns
 * the mutation, so a stray click cannot change an invoice.
 */
export function HomeCards() {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  /* Unbilled hides itself with nothing outstanding, so the layout asks what is
     present before splitting: a fixed `grid-cols-2` would leave a hole on an
     ordinary day. Pace always renders, so the split turns only on Unbilled. */
  const hasUnbilled = data.unbilled.byClient.length > 0;
  const splitColumns = hasUnbilled;

  /* No top margin: `Page` owns the inset above the first card. */
  return (
    <div className="flex flex-col gap-4">
      {splitColumns ? (
        /* 1.6fr / 1fr: the left column is rows that truncate when starved, the
           right a number and a bar that gain nothing from more room.
           `items-start` so a short right column does not stretch to match. */
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-4">
            <Unbilled stats={data} />
          </div>
          <div className="flex flex-col gap-4">
            <Pace stats={data} />
          </div>
        </div>
      ) : (
        <Pace stats={data} />
      )}

      {/* Full width — 30 bars in a narrow column is a smear. */}
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
    <Card
      title="Unbilled"
      icon={Wallet}
      value={formatCurrency(total, stats.currency)}
    >
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
              c.amount > 0 ? formatCurrency(c.amount, c.currency) : '—'
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

      {/* Never added to the total above: that is work not yet invoiced, this
          is money already asked for, and summing them double-counts. */}
      {stats.awaitingPayment > 0 ? (
        <Link
          href="/invoices?status=sent"
          className="flex items-baseline gap-1.5 border-t border-edge-subtle px-4 py-2 type-support text-subtle hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
        >
          <span className="type-meta text-muted">
            {formatCurrency(stats.awaitingPayment, stats.currency)}
          </span>
          sent, awaiting payment
        </Link>
      ) : null}
    </Card>
  );
}

/**
 * Month to date against the target. With no target the card stays, carrying a
 * line that names what a goal is for and links to the field — and no bar,
 * since a bar at zero says nothing.
 */
function Pace({ stats }: { stats: Stats }) {
  const p = stats.pace;

  if (!p) {
    return (
      <Card title={monthName()} icon={BarChart3} action={<EditGoal />}>
        <div className="px-4 pt-3.5 pb-3">
          <p className="type-support text-subtle">
            Set a monthly goal to track hours or revenue against it.
          </p>
        </div>
      </Card>
    );
  }

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
      <Card title={monthName()} icon={BarChart3} action={<EditGoal />}>
        <div className="px-4 pt-3.5 pb-3">
          <p className="type-support text-subtle">
            A {p.unit} target is set, but pace in {p.unit} is not computed yet.
          </p>
        </div>
      </Card>
    );
  }

  const actual = p.actual;
  const isRevenue = p.unit === 'revenue';
  /** Money in the unit the target is in; hours keep one decimal and an `h`. */
  const fmt = (n: number) =>
    isRevenue ? formatCurrency(n, stats.currency) : `${n.toFixed(1)}h`;

  return (
    <Card
      title={monthName()}
      icon={BarChart3}
      action={<EditGoal />}
      value={
        /* `items-baseline` with a wrap: a money target is several times wider
           than "120h", and inline it broke after the slash and stranded it at
           the end of the figure's line. */
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          {fmt(actual)}
          {/* The target is context for the figure, not part of it, so it is
              set at row scale rather than carried along at 30px. */}
          <span className="type-duration whitespace-nowrap text-subtle">
            / {fmt(p.target)}
          </span>
        </span>
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
          {/* Revenue reports no delta — it arrives in steps rather than
              accruing evenly, so a business-day projection would be
              arithmetic dressed as a finding. The figure above is the whole
              answer. */}
          {p.delta != null ? (
            <span
              className={`flex-none type-meta ${ahead ? 'text-muted' : 'text-warning'}`}
            >
              {/* Only hours reach here — revenue sends no delta — and hours
                  carry their own sign through `toFixed`. */}
              {ahead ? 'on pace' : 'behind'} {p.delta >= 0 ? '+' : ''}
              {fmt(p.delta)}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/**
 * Into the goal field in Settings. A link, not a dialog: Settings owns the
 * field, and a second editor here is a second place to look when the number is
 * wrong.
 */
function EditGoal() {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon-sm"
      className="-my-1 text-subtle hover:text-strong"
    >
      <Link href="/settings#goal" aria-label="Edit monthly goal">
        <Pencil aria-hidden strokeWidth={1.75} />
      </Link>
    </Button>
  );
}

/* ── shared shell ─────────────────────────────────────────────────── */

/**
 * A card, in one of two header modes, selected by passing `value`.
 *
 * A card whose point is one figure demotes its title to a quiet `type-label`
 * above the figure; a card whose point is a list keeps its heading, having no
 * figure to be subordinate to.
 */
function Card({
  title,
  icon: Icon,
  iconTone,
  value,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /* Neutral unless the card is *about* something being wrong. Never the
     accent, which belongs to the running timer. */
  iconTone?: 'warning';
  /** The card's subject. Supplying it demotes the title — see above. */
  value?: React.ReactNode;
  /** A single quiet control, top-right against the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (value !== undefined) {
    return (
      <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
        <header className="px-4 pt-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Icon
                aria-hidden
                strokeWidth={1.75}
                className={`size-3.5 flex-none ${
                  iconTone === 'warning' ? 'text-warning' : 'text-subtle'
                }`}
              />
              <h2 className="type-label truncate text-subtle">{title}</h2>
            </div>
            {action ? <div className="flex-none">{action}</div> : null}
          </div>
          <div className="mt-1.5 type-figure text-strong">{value}</div>
        </header>
        <div className="mx-4 border-t border-edge-subtle" />
        {children}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
      {/* The rule is INSET to the rows' own `px-4`, not a `border-b` on the
          header: full-width it cuts the panel in two and reads as two stacked
          cards. */}
      <header className="flex items-center gap-2 px-4 pt-3 pb-2.5">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={`size-4 flex-none ${
            iconTone === 'warning' ? 'text-warning' : 'text-muted'
          }`}
        />
        <h2 className="type-heading flex-1 truncate text-strong">{title}</h2>
        {action ? <div className="flex-none">{action}</div> : null}
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
  /* The label is the link and the actions sit beside it, never inside: an <a>
     containing a <button> is invalid HTML and Tab would land inside the link.

     Sized by CONTAINER, not viewport — the same card renders in Home's wide
     column and in the narrow dock, where a `sm:` breakpoint is true at 1600px
     and lays the row out as though there were room. */
  return (
    <li className="@container border-t border-edge-subtle first:border-t-0">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        {icon}

        {/* Detail wraps under the label when the card is narrow rather than
            hiding: "12 days late" IS the row. */}
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
        {/* The fixed `w-24` makes the amounts a column where there is room;
            auto-width in a narrow card. */}
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
