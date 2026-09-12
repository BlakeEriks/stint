'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatCompact } from '@stint/core';
import { AlertTriangle, ArrowRight, Clock, FileWarning } from 'lucide-react';
import { api, type Stats } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';
import { money } from './invoice-bits';

/**
 * The home screen's card set.
 *
 * Toggl's dashboard answers "how did I spend my time?", which a solo
 * contractor already knows — they were there. These answer the questions you
 * genuinely cannot answer from memory: how much money is sitting unbilled, is
 * anything about to go wrong, and am I on pace.
 *
 * Order is money at risk, money waiting, money coming, then texture. Nothing
 * here writes: every card reads, and every action is a link to the surface
 * that owns the mutation, because a dashboard that edits data turns a stray
 * click into a changed invoice.
 *
 * No card carries the accent. On this screen the accent is spent, and it is
 * spent on the running timer.
 */
export function HomeCards() {
  const tz = useTimeZone();
  const { data } = useQuery({
    queryKey: ['stats', tz],
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <NeedsAttention stats={data} />
      <Unbilled stats={data} />
      <Pace stats={data} />
    </div>
  );
}

/**
 * Things that are wrong, each linking to the place that fixes it.
 *
 * Rendered ONLY when it has rows. A permanent "all clear" card is the
 * SaveIndicator problem — a check that is always present says nothing — and
 * the card's absence is the good news.
 */
function NeedsAttention({ stats }: { stats: Stats }) {
  const { overdueInvoices, staleDrafts, unprojected } = stats.attention;
  const count =
    overdueInvoices.length + staleDrafts.length + (unprojected ? 1 : 0);
  if (count === 0) return null;

  return (
    <Card title="Needs attention">
      <ul className="flex flex-col">
        {/* Overdue sorts first and carries danger; everything else is a
            warning. Never the accent — see the module comment. */}
        {overdueInvoices.map((i) => (
          <Row
            key={i.invoiceId}
            href={`/invoices/${i.invoiceId}`}
            icon={
              <AlertTriangle aria-hidden className="size-3.5 text-danger" />
            }
            label={i.clientName ?? i.invoiceNumber}
            detail={`${i.daysLate} ${i.daysLate === 1 ? 'day' : 'days'} late`}
            value={money(i.amount, i.currency)}
            tone="danger"
          />
        ))}

        {staleDrafts.map((d) => (
          <Row
            key={d.invoiceId}
            href={`/invoices/${d.invoiceId}`}
            icon={<FileWarning aria-hidden className="size-3.5 text-warning" />}
            label={d.clientName ?? d.invoiceNumber}
            detail={`draft, ${d.ageDays} days old`}
            value={money(d.amount, d.currency)}
            tone="warning"
          />
        ))}

        {unprojected ? (
          <Row
            href="/"
            icon={<Clock aria-hidden className="size-3.5 text-warning" />}
            label={
              unprojected.count === 1
                ? '1 entry with no project'
                : `${unprojected.count} entries with no project`
            }
            detail="cannot resolve a rate"
            value={formatCompact(unprojected.seconds)}
            tone="warning"
          />
        ) : null}
      </ul>
    </Card>
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
    <Card title="Unbilled" value={money(total, stats.currency)}>
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

  return (
    <Card title={monthName()}>
      <div className="flex flex-col gap-2 px-4 py-3">
        {p.actual == null ? (
          <p className="type-support text-subtle">
            A {p.unit} target is set, but pace in {p.unit} is not computed yet.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-amount text-strong">
                {p.actual.toFixed(1)}h
                <span className="type-duration text-subtle">
                  {' / '}
                  {p.target}h
                </span>
              </span>
              <span
                className={`type-meta ${ahead ? 'text-muted' : 'text-warning'}`}
              >
                {ahead ? 'on pace' : 'behind'}{' '}
                {p.delta != null
                  ? `${p.delta >= 0 ? '+' : ''}${p.delta.toFixed(1)}h`
                  : null}
              </span>
            </div>

            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-elevated"
              role="img"
              aria-label={`${p.actual.toFixed(1)} of ${p.target} hours`}
            >
              {/* Neutral, not accent: the accent is the running timer. */}
              <div
                className="h-full rounded-full bg-text-subtle"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>

            <p className="type-support text-subtle">
              {p.businessDaysElapsed} of {p.businessDaysTotal} business days
              {stats.billableRatio != null
                ? ` · ${Math.round(stats.billableRatio * 100)}% billable`
                : null}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/* ── shared shell ─────────────────────────────────────────────────── */

function Card({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-primary shadow-card">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1">
        <h2 className="type-label text-subtle">{title}</h2>
        {value ? (
          <span className="type-amount text-strong">{value}</span>
        ) : null}
      </header>
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
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  detail: string;
  value: string;
  secondary?: string;
  tone?: 'danger' | 'warning';
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2.5 border-t border-edge-subtle px-4 py-2.5 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
      >
        {icon}

        {/* The detail wraps under the label on a narrow screen rather than
            hiding. "12 days late" IS the row — a client name and an amount
            without it is just an invoice, not something needing attention. */}
        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
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
        </span>

        {secondary ? (
          <span className="hidden w-16 flex-none text-right type-meta text-subtle sm:inline">
            {secondary}
          </span>
        ) : null}
        <span className="w-24 flex-none text-right type-duration text-primary">
          {value}
        </span>
        <ArrowRight aria-hidden className="size-3.5 flex-none text-subtle" />
      </Link>
    </li>
  );
}

function monthName() {
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date());
}
