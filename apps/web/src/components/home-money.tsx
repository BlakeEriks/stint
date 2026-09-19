import Link from 'next/link';
import { COLLECTED_MONTHS, formatCompact, formatCurrency } from '@stint/core';
import { Banknote, Hourglass, type LucideIcon, Send } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import type { Beat } from '@/lib/client/use-beat';
import { Money } from './money';
import { Swatch } from './swatch';
import {
  type Clients,
  INSET,
  INSET_X,
  Region,
  Row,
  unratedNote,
} from './home-shell';

/**
 * What just changed, under the figure it changed.
 *
 * **`success`, and only for a payment.** Stopping a timer and raising an
 * invoice are things the user just did; a payment is the one outcome on this
 * screen that happened *to* them, and spending the colour on all three spends
 * it on nothing.
 */
function InvoiceBeat({ beat, currency }: { beat: Beat; currency: string }) {
  if (!beat || beat.kind === 'stop') return null;

  const text =
    beat.kind === 'paid'
      ? `+${formatCurrency(beat.amount, currency)} collected`
      : `${formatCurrency(beat.amount, currency)} now awaiting`;

  return (
    <span
      className={`type-meta motion-safe:animate-in motion-safe:fade-in ${
        beat.kind === 'paid' ? 'text-success' : 'text-subtle'
      }`}
      data-beat={beat.kind}
    >
      {text}
    </span>
  );
}

/**
 * What a stop was worth, under the figure it moved.
 *
 * **Neutral, never the accent and never `success`.** The accent is the running
 * timer, and a stop has just ended one — borrowing it marks as live the one
 * thing that stopped being live. `success` is an outcome, and a stop is
 * something the user just did.
 *
 * `billable` is carried on the beat, decided where the arrival was, never
 * re-derived from the amount here: a net of zero has two causes that look
 * identical at this point, and unknown reports the hours alone, which is true
 * either way.
 */
function StopDelta({ beat, currency }: { beat: Beat; currency: string }) {
  if (beat?.kind !== 'stop') return null;

  /* An unbillable stop resolves to no money, so it reports the hours and lets
     the ratio carry it. `+$0.00` would teach the user that marking work
     billable is what makes the app respond — the UI arguing with the data. */
  const text =
    beat.billable === true
      ? `${beat.amount >= 0 ? '+' : '−'}${formatCurrency(
          Math.abs(beat.amount),
          currency,
        )}`
      : beat.billable === false
        ? `+${formatCompact(beat.seconds)} unbillable`
        : `+${formatCompact(beat.seconds)}`;

  return (
    <span
      className="type-meta text-subtle motion-safe:animate-in motion-safe:fade-in"
      data-beat="stop"
    >
      {text}
    </span>
  );
}

/**
 * Money that arrived, and the shape of the months it arrived in.
 *
 * The only finished figure on the screen: the work is done, the invoice is
 * settled, and nothing downstream revises it. Never summed with what is owed —
 * three stages of one pipeline, and any two added double-count the same hours.
 *
 * **Never hides.** An account that has collected nothing renders `$0.00`,
 * which is true and is also the figure its first payment will move. The
 * pairing needs both halves: with this one gone the grid puts Owed in its
 * place, and the screen reads as though money owed were what arrived.
 */
export function Collected({ stats, beat }: { stats: Stats; beat: Beat }) {
  const { trailing12, thisMonth, daysSincePaid, byMonth } = stats.collected;

  /* A zero month says so plainly. `+$0.00 this month` reads as a payment that
     was worth nothing rather than as a month without one. */
  const month =
    thisMonth > 0
      ? `+${formatCurrency(thisMonth, stats.currency)} this month`
      : 'nothing collected this month';

  return (
    <Region
      title={`Collected · ${COLLECTED_MONTHS} mo`}
      icon={Banknote}
      value={
        <Money
          amount={trailing12}
          currency={stats.currency}
          className="type-figure"
        />
      }
    >
      <p className={`${INSET_X} type-meta text-subtle`}>
        {month}
        {daysSincePaid == null ? null : (
          <>
            {' · '}
            {/* The cadence signal, and the reason this line exists: invoiced
                monthly, it is how a late payment is noticed without doing
                arithmetic against a date. */}
            {daysSincePaid === 0
              ? 'paid today'
              : `last paid ${daysSincePaid}d ago`}
          </>
        )}
      </p>
      {/* Its own line under the figure: beside a `type-figure` the chip would
          have to shrink to fit, and it retires while the figure does not. */}
      <p className={`${INSET_X} mt-0.5 min-h-4`}>
        <InvoiceBeat beat={beat} currency={stats.currency} />
      </p>
      <Series points={byMonth} currency={stats.currency} />
    </Region>
  );
}

/** Viewport of the collected plot, in its own units — SVG scales the path. */
const PLOT_W = 300;
const PLOT_H = 86;

/**
 * Collected per month, as a line.
 *
 * A month is a point in a sequence rather than a category: one payment a
 * month is a series, and a line is what a series looks like. Bars would ask
 * the eye to compare six things that are really one thing over time.
 */
function Series({
  points,
  currency,
}: {
  points: Stats['collected']['byMonth'];
  currency: string;
}) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.amount);
  const peak = Math.max(...values);
  const low = Math.min(...values);

  /* The base sits below the lowest month, by a third of the observed range,
     so a light month reads as lower rather than as nothing: at a base of the
     minimum it renders flat on the axis, and at zero a steady income draws
     six near-identical points with no shape at all.

     A month that collected NOTHING is the exception and sits on the axis,
     because zero collected is zero — padding beneath it would lift a month
     with no payment off the floor and claim it had one. So the base only
     drops below a minimum that is itself a real payment.

     This is why the axis carries no values: the scale is not proportional
     from zero, so the plot carries SHAPE and the figures carry amounts. */
  const range = Math.max(peak - low, peak * 0.3, 1);
  const base = low > 0 ? Math.max(0, low - range / 3) : 0;
  const span = Math.max(peak - base, 1);

  const x = (i: number) => (i / (points.length - 1)) * PLOT_W;
  const y = (v: number) => PLOT_H - 8 - ((v - base) / span) * (PLOT_H - 24);

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.amount)}`)
    .join(' ');
  const area = `${line} L${x(points.length - 1)},${PLOT_H - 8} L0,${PLOT_H - 8} Z`;
  const last = points.length - 1;
  const open = points[last];
  if (!open) return null;

  return (
    <div className={`${INSET_X} mt-3`}>
      {/* `preserveAspectRatio="none"` — a plot, not a glyph: it stretches to
          the region's width and the vertical scale carries the meaning. */}
      <svg
        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
        preserveAspectRatio="none"
        className="block h-[86px] w-full overflow-visible"
        role="img"
        aria-label={points
          .map((p) => `${p.month}: ${formatCurrency(p.amount, currency)}`)
          .join(', ')}
      >
        <line
          x1="0"
          y1={PLOT_H - 8}
          x2={PLOT_W}
          y2={PLOT_H - 8}
          className="stroke-edge-grid"
          strokeWidth="1"
        />
        <path d={area} className="fill-success opacity-15" />
        <path
          d={line}
          fill="none"
          className="stroke-success"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) =>
          i === last ? null : (
            <circle
              key={p.month}
              cx={x(i)}
              cy={y(p.amount)}
              r="2.5"
              className="fill-success"
            />
          ),
        )}
        {/* The current month is still being collected, and a filled dot would
            claim it had settled. */}
        <circle
          cx={x(last)}
          cy={y(open.amount)}
          r="4"
          className="fill-surface-primary stroke-success"
          strokeWidth="2.5"
        />
      </svg>
      {/* Each label is centred on ITS OWN point, at the same fraction of the
          width the point is drawn at. Six equal columns centre their labels a
          half-column in from each edge while the points sit ON the edges —
          a drift running +38px to −39px across the plot, which leaves no
          label clearly owning a dot.

          The two ends pull back inside the box rather than centring, so
          neither overhangs the plot. */}
      <div className="relative mt-1.5 h-4">
        {points.map((p, i) => (
          <span
            key={p.month}
            style={{
              left: `${(i / (points.length - 1)) * 100}%`,
              transform:
                i === 0
                  ? 'none'
                  : i === last
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
            className={`absolute type-meta ${
              i === last ? 'text-muted' : 'text-subtle'
            }`}
          >
            {monthLabel(p.month)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** `2026-09` → `Sep`. Built as UTC, so no zone can shift it a month. */
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(y), Number(m) - 1, 1)));
}

/**
 * Money not yet arrived, in its two stages, and who owes the second.
 *
 * Awaiting and unbilled take the same weight: one is money asked for and the
 * other money not yet asked for, and the difference is a stage rather than a
 * size. Neither is ever added to the other, nor to what has been collected.
 */
export function Owed({
  stats,
  beat,
  clients,
}: {
  stats: Stats;
  beat: Beat;
  clients: Clients;
}) {
  const { byClient, moreClients, total } = stats.unbilled;
  const awaiting = stats.awaitingPayment;

  /* Nothing owed at all — no invoice out, no work unbilled. The collected
     half carries the screen on its own. */
  if (awaiting <= 0 && byClient.length === 0) return null;

  return (
    <section className="py-1">
      {/* No region title above them. "Owed" named a grouping rather than a
          quantity, and the two figures beneath it already say what they are —
          so it cost a row to restate the obvious. Each figure carries its own
          label at region weight instead, which is what it always was. */}
      <div className={`flex gap-3 ${INSET} pt-3`}>
        <Figure
          icon={Send}
          label="Awaiting"
          amount={awaiting}
          currency={stats.currency}
          /* The COUNT, never a description of the worst of them: naming one
             invoice says nothing about the others, and at two or more it
             drops them silently. Which invoice is late is the inbox's
             subject, where it arrives with the action that answers it. */
          detail={
            awaiting > 0
              ? `${stats.openInvoiceCount} open invoice${
                  stats.openInvoiceCount === 1 ? '' : 's'
                }`
              : 'nothing outstanding'
          }
          href={awaiting > 0 ? '/invoices?status=sent' : undefined}
        />
        <Figure
          icon={Hourglass}
          label="Unbilled"
          amount={total}
          currency={stats.currency}
          /* Age, because it is what makes unbilled work worth acting on: the
             figure alone cannot say whether it is a day old or a quarter. */
          detail={
            byClient.length > 0
              ? `${Math.max(...byClient.map((c) => c.oldestDays))}d oldest`
              : 'nothing unbilled'
          }
          /* A stop moves THIS figure, so its chip replaces this figure's own
             detail line rather than taking a row of its own. Only a stop the
             beat could not price needs saying — a priced one is already in
             the figure above it, travelling. */
          override={
            beat?.kind === 'stop' && beat.billable !== true ? (
              <StopDelta beat={beat} currency={stats.currency} />
            ) : null
          }
        />
      </div>

      {byClient.length > 0 ? (
        <>
          {/* NAMED, because both figures above are money owed and this breaks
              down only one of them. Unnamed it reads as a breakdown of the
              pair, and the same client can appear in both at different
              amounts. */}
          <h3 className={`${INSET} pt-4 pb-1 type-label text-subtle`}>
            Unbilled by client
          </h3>
          <ul
            className={`${INSET_X} flex flex-col [&>li+li]:border-t [&>li+li]:border-edge-grid`}
          >
            {byClient.map((c) => (
              <Row
                key={c.clientId ?? 'none'}
                // Links to generation for this client, which is what makes
                // the list an action rather than a readout.
                href={
                  c.clientId
                    ? `/invoices/new?clientId=${c.clientId}`
                    : '/invoices/new'
                }
                icon={
                  <Swatch
                    color={c.clientId ? clients.get(c.clientId)?.color : null}
                  />
                }
                label={c.clientName}
                detail={[`${c.oldestDays}d`, unratedNote(c.unratedCount)]
                  .filter(Boolean)
                  .join(' · ')}
                value={
                  /* Unbillable work has no rate by definition; an em-dash is
                     honest where a zero would look like a real figure.

                     A rated row TWEENS, like the figure it breaks down: a row
                     that snaps beside a figure that travels reads as the
                     stale one. */
                  c.amount > 0 ? (
                    <Money
                      amount={c.amount}
                      currency={c.currency}
                      className="type-duration"
                    />
                  ) : (
                    '—'
                  )
                }
              />
            ))}
          </ul>
          {moreClients > 0 ? (
            <p className={`${INSET} py-2 type-support text-subtle`}>
              +{moreClients} more
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** One of the two owed figures, with its icon, its amount and its line. */
function Figure({
  icon: Icon,
  label,
  amount,
  currency,
  detail,
  href,
  override,
}: {
  icon: LucideIcon;
  label: string;
  amount: number;
  currency: string;
  detail: string;
  /** Present only while the figure has somewhere worth going. */
  href?: string;
  /** Replaces `detail` while a beat has something better to say. */
  override?: React.ReactNode;
}) {
  const body = (
    <>
      {/* The same head a region takes — an icon and a `type-label` — because
          each of these IS one. A pip is a colour standing for a client, and
          neither of these figures belongs to one. */}
      <span className="flex items-center gap-2">
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className="size-3.5 flex-none text-subtle"
        />
        <span className="type-label truncate text-subtle">{label}</span>
      </span>
      <Money
        amount={amount}
        currency={currency}
        className="mt-1.5 type-amount-hero text-strong"
      />
      <span className="type-meta text-subtle">{override ?? detail}</span>
    </>
  );

  if (!href) {
    return <span className="flex min-w-0 flex-1 flex-col gap-px">{body}</span>;
  }

  return (
    <Link
      href={href}
      className="flex min-w-0 flex-1 flex-col gap-px rounded-sm hover:[&_.type-amount-hero]:underline hover:[&_.type-amount-hero]:decoration-edge-subtle hover:[&_.type-amount-hero]:underline-offset-4 focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
    >
      {body}
    </Link>
  );
}
