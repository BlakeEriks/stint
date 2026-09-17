'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  formatCompact,
  localDateKey,
  startOfLocalDayOffset,
} from '@stint/core';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  type LucideIcon,
  Pencil,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Pace, type Stats } from '@/lib/client/api';
import { timeZone as tz } from '@/lib/client/use-timer';
import { formatCurrency } from './invoice-bits';
import { keys } from '@/lib/client/query-keys';
import { useCountUp, useSinceLastSeen } from '@/lib/client/use-count-up';
import { cause, type Figures, useDayState } from '@/lib/client/use-day-state';

/**
 * The home screen's regions, in three rows: money waiting beside who owes it,
 * the month beside the trailing quarter, then a year of texture across both.
 *
 * **Nothing here writes.** Every action is a link to the surface that owns
 * the mutation, so a stray click cannot change an invoice.
 *
 * The content column is itself the panel, so no region draws a border, a
 * background or a shadow — a bordered card inside a bordered panel is the
 * disjointedness the frame removed. Regions separate by an inset rule.
 */
/**
 * The day, and what moved while you were away.
 *
 * The date is the answer to "is this figure current?", which is the question
 * a dashboard that mostly does not change invites. The since-line belongs
 * here rather than on Unbilled because it describes the screen: the money
 * moved, and so did the invoice it was raised against.
 */
function PanelHead({
  delta,
  currency,
}: {
  delta: number | null;
  currency: string;
}) {
  const now = new Date();
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
    now,
  );
  const date = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(now);

  /* No bottom padding: the first region's own `pt-3` follows it, and adding
     to that left 20px under the day name where the mockup has 8. The head
     carries the since-line's space only when the line is there to need it. */
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h2 className="type-heading text-strong">{day}</h2>
        <SinceLine delta={delta} currency={currency} />
      </div>
      <span className="flex-none type-label text-subtle">{date}</span>
    </div>
  );
}

export function HomeCards() {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  return <Panel stats={data} />;
}

/**
 * Split from `HomeCards` because the since-line is read here, and a hook
 * cannot run above the `!data` guard that makes `stats` defined.
 */
function Panel({ stats }: { stats: Stats }) {
  const day = useDayState(stats);
  const data = stats;

  /* `@container` on the panel, and every pairing below sizes off it. The
     panel is NOT the window: the rail and the dock flank it and claim their
     space at `lg` and `xl`, so the panel is 780px at a 1100px window and
     732px at 1440 — wider at the narrower window. A viewport breakpoint
     would collapse the wide one and split the narrow one. */
  return (
    /* The panel owns its inset: `Page` is `flush` here because its padding
       would land inside this surface, not around it. `pb-4` closes the
       bottom, which the regions' own padding does not reach. */
    <div className="@container flex flex-col pb-4">
      <PanelHead delta={day.sinceOpen} currency={data.currency} />
      <Pair
        left={<Unbilled stats={data} earnedToday={day.earnedToday} />}
        right={<ByClient stats={data} />}
      />
      <Rule />
      <Pair left={<Month stats={data} />} right={<Velocity stats={data} />} />
      <Rule />
      <Heatmap />
    </div>
  );
}

/**
 * Two regions side by side, stacked while the panel is narrow.
 *
 * `items-start` so the shorter half does not stretch to the taller one's
 * height and hang its content in the middle of empty space.
 *
 * The left half is the wider: it carries the figures, and an equal split
 * leaves the by-client names truncating while the money column has room to
 * spare.
 */
function Pair({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  /* No vertical divider between the columns, ever. The rules on this screen
     are horizontal and inset; a vertical one rebuilds the gridlines the
     panel removed and reads the pair as two cards again. */
  return (
    <div className="grid items-start gap-x-6 @2xl:grid-cols-[1.15fr_1fr]">
      {left}
      {right}
    </div>
  );
}

type Beat = { kind: 'stop' | 'paid'; amount: number; seconds: number } | null;

/** How long the delta stays beside the figure once the tween has landed. */
const BEAT_MS = 2600;

/**
 * The last thing that happened, for as long as it is worth saying.
 *
 * Retires itself on a timer: the delta answers "what just changed", and a
 * chip still sitting there minutes later is answering a question the user has
 * stopped asking — and would be read as part of the figure.
 */
function useBeat(stats: Stats): Beat {
  const prev = useRef<Figures | null>(null);
  const [beat, setBeat] = useState<Beat>(null);

  /* The three figures a beat is read from, captured as scalars so the effect
     below depends on THEM and not on the `stats` object.

     React Query returns a new object whenever any field changes — a client's
     age ticking over, a task renamed. An effect keyed on the object re-runs
     for those, and its cleanup clears the pending retirement timeout before
     the `no cause` guard returns without arming a replacement: the chip is
     stranded beside the figure, which is the exact failure the timer exists
     to prevent. `useDayState` keys on its figure for the same reason. */
  const { total, seconds } = stats.unbilled;
  const { awaitingPayment } = stats;

  useEffect(() => {
    const next = { total, seconds, awaitingPayment };
    const before = prev.current;
    prev.current = next;
    const kind = cause(before, next);
    if (!kind || !before) return;

    /* Each kind takes its amount from the axis its own event moves: a raised
       invoice is what landed in `awaitingPayment`, never the net of unbilled,
       which a concurrent stop would have already mixed into. */
    setBeat({
      kind,
      amount:
        kind === 'paid'
          ? awaitingPayment - before.awaitingPayment
          : total - before.total,
      seconds: seconds - before.seconds,
    });
    const t = setTimeout(() => setBeat(null), BEAT_MS);
    return () => clearTimeout(t);
  }, [total, seconds, awaitingPayment]);

  return beat;
}

/**
 * What the last change was worth, beside the figure it changed.
 *
 * **Neutral, never the accent.** The accent is the running timer, and a stop
 * has just ended one — borrowing it here would mark as live the one thing
 * that stopped being live.
 *
 * An unbillable stop resolves to no money, so it reports the hours and lets
 * the ratio carry it. A stop that moves nothing at all would teach the user
 * that marking work billable is what makes the app respond, which is the UI
 * arguing with the data.
 */
function Delta({ beat, currency }: { beat: Beat; currency: string }) {
  if (!beat) return null;

  /* `paid` counts Unbilled DOWN: the money left work-not-yet-invoiced. Its
     amount arrives positive, as the rise in what is awaiting payment. */
  const money = beat.kind === 'paid' ? -beat.amount : beat.amount;
  /* Only a stop can be unbillable. A raised invoice always carries a figure,
     so it is never routed to the hours branch — that is how paid, billable
     money came to be labelled unbillable. */
  const billable = beat.kind === 'paid' || Math.abs(beat.amount) > 0;

  /* Reports, never praises: "invoiced" is what happened, and a stop that
     earned nothing says the hours it did earn instead. */
  const text = billable
    ? `${money >= 0 ? '+' : '−'}${formatCurrency(Math.abs(money), currency)}`
    : `+${formatCompact(beat.seconds)} unbillable`;

  return (
    <span
      className={`type-meta tabular-nums motion-safe:animate-in motion-safe:fade-in ${
        beat.kind === 'paid' ? 'text-success' : 'text-subtle'
      }`}
      data-beat={beat.kind}
    >
      {text}
      {beat.kind === 'paid' ? ' invoiced' : null}
    </span>
  );
}

/**
 * What today has earned, beside the figure it added to.
 *
 * A fact about the day rather than a flash about a fetch, so it does not
 * retire on a timer and it survives a refresh. **Neutral, never the accent** —
 * the accent is the running timer, and a stop has just ended one.
 *
 * A transient beat still outranks it for the one thing the running total
 * cannot say: an unbillable stop earned no money, and reporting `+$0.00`
 * would teach the user that only billable work makes the app respond. The
 * beat says the hours instead, and the total resumes when it retires.
 */
function Earned({
  amount,
  beat,
  currency,
}: {
  amount: number | null;
  beat: Beat;
  currency: string;
}) {
  const unbillable = beat && beat.kind === 'stop' && beat.amount === 0;
  if (unbillable || beat?.kind === 'paid') {
    return <Delta beat={beat} currency={currency} />;
  }

  /* Absent at zero, which includes "nothing stopped yet today". An empty
     slot is quieter than a chip reporting no movement. `0` is a valid
     amount, so this is a value check and never truthiness. */
  if (amount == null || amount === 0) return null;

  return (
    <span
      className="type-meta tabular-nums text-subtle motion-safe:animate-in motion-safe:fade-in"
      data-earned="today"
    >
      {amount > 0 ? '+' : '−'}
      {formatCurrency(Math.abs(amount), currency)} today
    </span>
  );
}

/** One key per origin — a display detail of THIS browser, never account state. */
const SEEN_UNBILLED = 'stint.seen.unbilled';

/**
 * What has moved since yesterday closed.
 *
 * Measured against a baseline taken once per local day, so it says the same
 * thing however often the app is opened — the previous mechanism overwrote
 * itself on every load, which made it "since you last had this tab open".
 *
 * Absent on a first load, where `delta` is null: with nothing stored there is
 * no period to name, and "since yesterday" over the user's whole history is a
 * sentence that is simply untrue.
 */
function SinceLine({
  delta,
  currency,
}: {
  delta: number | null;
  currency: string;
}) {
  if (delta == null || delta === 0) return null;

  return (
    <p className="type-support text-subtle">
      Since yesterday,{' '}
      <span className="type-meta tabular-nums text-muted">
        {delta > 0 ? '+' : '−'}
        {formatCurrency(Math.abs(delta), currency)}
      </span>{' '}
      {delta > 0 ? 'unbilled' : 'invoiced'}
    </p>
  );
}

/**
 * Work with no client to take a hue from: named in a legend, still not rest.
 *
 * `--color-subtle`, not `--color-text-subtle`: the generator strips the
 * `text-` Tailwind reads as a utility prefix, so the variable the token file
 * calls `text.subtle` is emitted bare. An undefined `var()` here paints
 * nothing and reports nothing.
 */
const NEUTRAL = 'var(--color-subtle)';

/**
 * The rule between two regions.
 *
 * Inset to the regions' own `px-5`, never a `border-b` on a header: full-bleed
 * it cuts the panel in two and reads as two stacked cards, which is the shape
 * this screen stopped using.
 */
function Rule() {
  /* 18px each side, which is the panel's rhythm: at `my-1` the regions read
     as a list of rows rather than as four things sharing one surface. */
  return <div className="mx-5 my-[18px] border-t border-edge-subtle" />;
}

/* ── Unbilled ──────────────────────────────────────────────────────── */

/**
 * Money waiting — the headline number, and the reason this screen exists.
 *
 * Never labelled "earned" or "revenue": it is work done and not yet invoiced,
 * money the user might still never see. Overstating it in a billing tool is
 * the same trust failure as silently editing an entry.
 */
function Unbilled({
  stats,
  earnedToday,
}: {
  stats: Stats;
  earnedToday: number | null;
}) {
  const { total, byClient } = stats.unbilled;
  const beat = useBeat(stats);
  /* Travel only. This still animates from what this browser last DISPLAYED,
     which is a fact about the screen; the two figures that describe a period
     — today's earnings and the day-over-day line — come from `useDayState`
     and are measured against the day, not against the last paint. */
  const arrival = useSinceLastSeen(SEEN_UNBILLED, total);

  if (byClient.length === 0) return null;

  return (
    <Region
      title="Unbilled"
      icon={Wallet}
      value={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular-nums">
            {formatCurrency(arrival.value, stats.currency)}
          </span>
          <Earned amount={earnedToday} beat={beat} currency={stats.currency} />
        </span>
      }
    >
      {/* Never added to the total above: that is work not yet invoiced, this
          is money already asked for, and summing them double-counts.

          A text link, not a row: `inline-flex` keeps the hover and the focus
          ring around the words. At `flex` it filled the region's width, so
          the hover fill reached the panel's edges and read as a button. */}
      {stats.awaitingPayment > 0 ? (
        <Link
          href="/invoices?status=sent"
          className="mx-5 mt-1 mb-1 inline-flex items-baseline gap-1.5 rounded-sm type-support text-subtle hover:text-muted hover:underline hover:decoration-edge-subtle hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
        >
          <span className="type-meta text-muted">
            {formatCurrency(stats.awaitingPayment, stats.currency)}
          </span>
          sent, awaiting payment
        </Link>
      ) : null}
    </Region>
  );
}

/**
 * Who the unbilled money is owed by, beside the figure it sums to.
 *
 * Its own region rather than a list under the figure: paired, the total and
 * its breakdown are read together, and stacked they put every other region a
 * screenful further down.
 *
 * No icon and no figure of its own — it is the second half of one subject,
 * and a heading at region weight would announce it as a third.
 */
function ByClient({ stats }: { stats: Stats }) {
  const { byClient, moreClients } = stats.unbilled;
  /* Archived clients included: a finished engagement keeps its hue, and
     dropping it would silently reassign those hours to the neutral. */
  const { data: clientData } = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });

  if (byClient.length === 0) return null;

  const colours = new Map(
    (clientData?.clients ?? []).map((c) => [c.id, c.color]),
  );

  return (
    <section className="py-1">
      <h2 className="px-5 pt-3 pb-1 type-label text-subtle">By client</h2>
      {/* A hairline BETWEEN rows, never above the first — the section head
          already separates it from what is above. `mx-5` rather than padding
          on the row, so the rule starts where the content does. */}
      <ul className="mx-5 flex flex-col [&>li+li]:border-t [&>li+li]:border-edge-subtle/60">
        {byClient.map((c) => (
          <Row
            key={c.clientId ?? 'none'}
            // Links to generation for this client, which is what makes the
            // region an action rather than a readout.
            href={
              c.clientId
                ? `/invoices/new?clientId=${c.clientId}`
                : '/invoices/new'
            }
            icon={
              <Pip
                colour={
                  (c.clientId ? colours.get(c.clientId) : null) ?? NEUTRAL
                }
              />
            }
            label={c.clientName}
            /* Bare, because the column says what it is: the age sits against
               the amount it is ageing, where "oldest" spent width the client
               name wanted. Unrated work still says so — it is the reason a
               figure is lower than it should be. */
            detail={
              c.unratedCount > 0
                ? `${c.oldestDays}d · ${c.unratedCount} unrated`
                : `${c.oldestDays}d`
            }
            value={
              /* Unbillable work has no rate by definition; an em-dash is
                 honest where a zero would look like a real figure. */
              c.amount > 0 ? formatCurrency(c.amount, c.currency) : '—'
            }
          />
        ))}
      </ul>
      {moreClients > 0 ? (
        <p className="px-5 py-2 type-support text-subtle">
          +{moreClients} more
        </p>
      ) : null}
    </section>
  );
}

/* ── Month ─────────────────────────────────────────────────────────── */

/**
 * Month to date as a cumulative line against the goal ray.
 *
 * The gap between the two lines IS the delta — a distance you read rather
 * than a percentage you decode. With no target the region stays, carrying a
 * line that names what a goal is for and links to the field.
 */
function Month({ stats }: { stats: Stats }) {
  const p = stats.pace;

  if (!p) {
    return (
      <Region title={monthName()} icon={CalendarDays} action={<EditGoal />}>
        <div className="px-5 pt-1 pb-3">
          <p className="type-support text-subtle">
            Set a monthly goal to track hours or revenue against it.
          </p>
        </div>
      </Region>
    );
  }

  /* No figure yet means no subject, so the region keeps a heading rather than
     demoting its title above an empty space. */
  if (p.actual == null) {
    return (
      <Region title={monthName()} icon={CalendarDays} action={<EditGoal />}>
        <div className="px-5 pt-1 pb-3">
          <p className="type-support text-subtle">
            A {p.unit} target is set, but pace in {p.unit} is not computed yet.
          </p>
        </div>
      </Region>
    );
  }

  const actual = p.actual;
  const isRevenue = p.unit === 'revenue';
  /** Money in the unit the target is in; hours keep one decimal and an `h`. */
  const fmt = (n: number) =>
    isRevenue ? formatCurrency(n, stats.currency) : `${n.toFixed(1)}h`;

  /* "Behind" is derived from BUSINESS days elapsed, not calendar days: a
     120-hour target is six hours a working day, and reading "behind" on a
     Monday because the weekend passed would be noise pretending to be
     signal. */
  const ahead = p.delta != null && p.delta >= 0;

  return (
    /* The only region with no figure, and deliberately: its answer is the
       SHAPE of the month against its goal, and a 30px total above the plot
       restates the fraction top-right while pulling the eye off the line
       that is doing the work. */
    <Region
      title={monthName()}
      icon={CalendarDays}
      labelled
      action={
        <span className="flex items-center gap-1">
          <span className="type-meta whitespace-nowrap text-subtle">
            {fmt(actual)} / {fmt(p.target)}
          </span>
          <EditGoal />
        </span>
      }
    >
      <div className="flex flex-col gap-2 px-5 pt-1 pb-3">
        <PaceLine
          series={p.series}
          target={p.target}
          ahead={ahead}
          label={`${fmt(actual)} of ${fmt(p.target)}`}
        />

        <div className="flex items-baseline justify-between gap-3">
          <p className="type-support text-subtle">
            {p.businessDaysElapsed} of {p.businessDaysTotal} business days
            {stats.billableRatio != null
              ? ` · ${Math.round(stats.billableRatio * 100)}% billable`
              : null}
          </p>
          {p.delta != null ? (
            <span
              className={`flex-none type-meta ${ahead ? 'text-muted' : 'text-warning'}`}
            >
              {ahead ? 'on pace' : 'behind'} {p.delta >= 0 ? '+' : ''}
              {fmt(p.delta)}
            </span>
          ) : null}
        </div>
      </div>
    </Region>
  );
}

/** Viewport of the pace plot, in its own units — the path is scaled by SVG. */
const PLOT_W = 300;
const PLOT_H = 104;

/**
 * The cumulative line against the goal ray, the gap between them shaded.
 *
 * `actual` is null beyond today (`PacePoint`), so the line stops where the
 * month does rather than flattening to the 31st, which would read as a month
 * that stopped working.
 *
 * `preserveAspectRatio="none"` — this is a plot, not a glyph: it stretches to
 * the region's width and the vertical scale is the one that carries meaning.
 */
function PaceLine({
  series,
  target,
  label,
  ahead,
}: {
  series: Pace['series'];
  target: number;
  label: string;
  /** Which side of the ray the line is on, which is what colours the gap. */
  ahead: boolean;
}) {
  if (series.length < 2) return null;

  /* The ray's end is the target, so the scale is the target unless the month
     ran past it — a line that leaves the top of the box would misreport a
     month that beat its goal. */
  const peak = Math.max(
    target,
    ...series.map((p) => p.actual ?? 0),
    ...series.map((p) => p.expected),
    1,
  );
  const x = (i: number) => (i / (series.length - 1)) * PLOT_W;
  const y = (v: number) => PLOT_H - (v / peak) * PLOT_H;

  const done = series.filter((p) => p.actual != null);
  const last = done.at(-1) ?? null;
  const actualPath = done
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.actual ?? 0)}`)
    .join(' ');
  const rayPath = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.expected)}`)
    .join(' ');

  /* The delta as a closed area: down the ray to today, back along the actual.
     The shape between the lines is the answer, so it is filled rather than
     left for the eye to measure. */
  const gap =
    done.length >= 2
      ? `${done.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.expected)}`).join(' ')} ` +
        `${[...done]
          .reverse()
          .map((p, i) => `L${x(done.length - 1 - i)},${y(p.actual ?? 0)}`)
          .join(' ')} Z`
      : null;

  return (
    <svg
      viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
      preserveAspectRatio="none"
      className="h-26 w-full"
      role="img"
      aria-label={label}
    >
      {/* The gap says which way it runs. Warning matches the "behind" figure
          below it, so the shape and the number agree. Ahead takes `info`, not
          `success`: cyan is reserved for an outcome, and a month that is ahead
          on the 13th can be behind on the 14th. */}
      {gap ? (
        /* Two opacities, not one: `info` is a muted blue and `warning` a
           bright amber, so the same alpha puts the blue 30% weaker against
           the panel (OKLCH ΔL 0.076 vs 0.109). These land both near 0.11, so
           the gap carries the same weight whichever way the month is going. */
        <path
          d={gap}
          fill={ahead ? 'var(--color-info)' : 'var(--color-warning)'}
          opacity={ahead ? '0.26' : '0.18'}
        />
      ) : null}
      {/* The ray is the reference, so it recedes: dashed and quiet. */}
      <path
        d={rayPath}
        fill="none"
        stroke="var(--color-subtle)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      {/* The subject of the region, so it carries the weight the figure used
          to. Neutral, never the accent: the accent is the running timer. */}
      <path
        d={actualPath}
        fill="none"
        stroke="var(--color-strong)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Today. Without it the line reads as having run out of data rather
          than as having reached the present. */}
      {last ? (
        /* A zero-length round-capped stroke, not a <circle>: the plot sets
           `preserveAspectRatio="none"`, so x and y scale by different factors
           and a circle renders as a squashed ellipse. A cap is drawn in stroke
           space, which `vectorEffect` keeps round. */
        <path
          d={`M${x(done.length - 1)},${y(last.actual ?? 0)} l0,0`}
          stroke="var(--color-strong)"
          strokeWidth="6"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
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

/* ── Velocity ──────────────────────────────────────────────────────── */

/**
 * The trailing quarter's gross, and how it was made up.
 *
 * **The figure is gross, and the unit says so** — it is work done over the
 * window,
 * not money collected, and the invoiced/unbilled split is what says so. Not
 * comparable with `awaitingPayment`, which spans every period.
 *
 * **Not a row list.** Unbilled is a figure over per-client rows, and a second
 * region in that shape — same columns, same trailing arrow, and with a full
 * book the same order of magnitude — reads at a glance as the first one
 * printed twice. The mix is a bar and a key instead: a shape, not a table.
 */
function Velocity({ stats }: { stats: Stats }) {
  const v = stats.velocity;
  const beat = useBeat(stats);
  /* Invoiced, not the total: a payment moves money across the split without
     changing the gross, so the total is the one figure that does NOT move on
     the beat this region exists to show. */
  const invoiced = useCountUp(v.invoiced);

  /* The same query the heatmap runs, so the hues agree and React Query serves
     one fetch to both. Archived included: a finished engagement is still part
     of the trailing window. */
  const { data: clientData } = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });

  if (v.byClient.length === 0) return null;

  const colours = new Map(
    (clientData?.clients ?? []).map((c) => [c.id, c.color]),
  );
  /* `0` is a valid figure: a client whose whole window is still unbilled
     grosses its unbilled amount, not nothing. */
  const gross = (c: (typeof v.byClient)[number]) => c.invoiced + c.unbilled;
  const paid = beat?.kind === 'paid';

  /** Per month, which is what makes two windows comparable. */
  const perMonth = v.total / v.months;

  return (
    <Region
      title="Velocity"
      /* The window is the region's caveat, not its subject: a figure per
         month means nothing without the span it averages over. */
      action={
        <span className="type-meta text-subtle">trailing {v.months}mo</span>
      }
      icon={TrendingUp}
      value={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular-nums">
            {formatCurrency(perMonth, stats.currency)}
          </span>
          <span className="type-duration text-subtle">/mo gross</span>
        </span>
      }
    >
      <div className="flex flex-col gap-2 px-5 pt-1 pb-3">
        <Mix clients={v.byClient} colours={colours} gross={gross} />

        {/* Inline, with a swatch — never rows. A name and its share is all
            the bar needs to be read; an aging column and an amount column
            rebuild the shape this region exists not to be. */}
        <p className="flex flex-wrap gap-x-4 gap-y-1 type-support text-subtle">
          {v.byClient.map((c) => (
            <span
              key={c.clientId ?? 'none'}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden
                className="size-2 flex-none rounded-[2px]"
                style={{
                  backgroundColor:
                    (c.clientId ? colours.get(c.clientId) : null) ?? NEUTRAL,
                  opacity: MIX_OPACITY,
                }}
              />
              <span className="truncate text-muted">{c.clientName}</span>
              <span className="type-meta tabular-nums">
                {formatCurrency(gross(c), c.currency)}
              </span>
            </span>
          ))}
          {v.moreClients > 0 ? <span>+{v.moreClients} more</span> : null}
        </p>

        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 type-support text-subtle">
          <span>
            {/* The one outcome on this screen, and the only cyan on it:
                money that arrived. It rides the tween and leaves with it,
                so the colour marks the event, not a standing state. */}
            <span
              className={`type-meta tabular-nums ${
                paid ? 'text-success' : 'text-muted'
              }`}
              data-beat={paid ? 'paid' : undefined}
            >
              {formatCurrency(invoiced.value, stats.currency)}
            </span>{' '}
            invoiced
          </span>
          <span>
            <span className="type-meta tabular-nums text-muted">
              {formatCurrency(v.unbilled, stats.currency)}
            </span>{' '}
            unbilled
          </span>
          <span className="ml-auto type-meta tabular-nums">
            {formatCompact(v.seconds)}
          </span>
        </p>
      </div>
    </Region>
  );
}

/**
 * Muted, because the hues at full strength across the panel's width pull
 * harder than the running timer, which is the one thing allowed to shout.
 */
const MIX_OPACITY = 0.62;

/**
 * The window's mix, one segment per client — the region's picture.
 *
 * Shares of the gross, so the bar always fills: it answers "who was this
 * quarter" rather than progress toward anything, and a bar with a gap in it
 * would invite the invoiced/unbilled reading the line below already owns.
 */
function Mix({
  clients,
  colours,
  gross,
}: {
  clients: Stats['velocity']['byClient'];
  colours: Map<string, string | null>;
  gross: (c: Stats['velocity']['byClient'][number]) => number;
}) {
  const total = clients.reduce((sum, c) => sum + gross(c), 0);
  if (total <= 0) return null;

  return (
    <div
      className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
      role="img"
      aria-label={clients
        .map((c) => `${c.clientName} ${formatCurrency(gross(c), c.currency)}`)
        .join(', ')}
    >
      {clients.map((c) => (
        <div
          key={c.clientId ?? 'none'}
          className="h-full rounded-full"
          style={{
            width: `${(gross(c) / total) * 100}%`,
            backgroundColor:
              (c.clientId ? colours.get(c.clientId) : null) ?? NEUTRAL,
            opacity: MIX_OPACITY,
          }}
        />
      ))}
    </div>
  );
}

/* ── Heatmap ───────────────────────────────────────────────────────── */

/** Internal work: no client, so no hue — but not rest either. */
const INTERNAL = '';

/** A full year of columns, which is what makes a seasonal shape visible. */
const WEEKS = 52;
const DAYS = WEEKS * 7;

/**
 * A year of days: when the work happened, and whose it was.
 *
 * **Hue is the client**, resolved as everywhere else and never the accent;
 * **density is the hours**. A blank day stays blank — a weekend is
 * information, not missing data.
 *
 * A day split across clients takes the one with the most hours. A cell is
 * ~11px and cannot carry a stack; the alternative is a smear of colour that
 * names nobody.
 */
function Heatmap() {
  const now = new Date();
  const from = startOfLocalDayOffset(now, tz, DAYS - 1);

  const { data } = useQuery({
    queryKey: keys.heatmap(tz),
    queryFn: () =>
      api.activity({ from: from.toISOString(), to: now.toISOString(), tz }),
  });

  /* Archived clients included: work billed to a finished engagement still
     belongs in the history, and dropping its colour would silently reassign
     those hours to the neutral band. */
  const { data: clientData } = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });

  if (!data) return null;

  const clients = new Map((clientData?.clients ?? []).map((c) => [c.id, c]));
  const byDate = new Map(data.days.map((d) => [d.date, d]));

  /* Every day in the range gets a cell, present in the response or not, so a
     gap is a day nobody worked rather than a column that quietly closed up. */
  const cells = Array.from({ length: DAYS }, (_, i) => {
    const at = startOfLocalDayOffset(now, tz, DAYS - 1 - i);
    const key = localDateKey(at, tz);
    return { key, day: byDate.get(key) };
  });

  /* The busiest day sets the density scale. A fixed ceiling would flatten a
     quiet year into nothing. */
  const peak = Math.max(...cells.map((c) => c.day?.totalSeconds ?? 0), 1);
  const yearSeconds = cells.reduce(
    (sum, c) => sum + (c.day?.totalSeconds ?? 0),
    0,
  );

  /* Ranked over the whole year, not per week, so the legend names the clients
     the year was actually spent on. */
  const totals = new Map<string, number>();
  for (const { day } of cells) {
    for (const [id, seconds] of Object.entries(day?.byClient ?? {})) {
      totals.set(id, (totals.get(id) ?? 0) + seconds);
    }
  }
  const named = [...totals.entries()]
    .filter(([id, seconds]) => id !== INTERNAL && seconds > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  const inLegend = new Set(named);
  const hasOther = [...totals.entries()].some(
    ([id, seconds]) => seconds > 0 && !inLegend.has(id),
  );

  return (
    <Region
      title="Year"
      icon={BarChart3}
      action={
        /* `whitespace-nowrap`: the heading beside it is `flex-1`, so at a
           narrow width the streak is what gives, and "34 day / streak" over
           two lines reads as a figure that outgrew its slot. */
        <span className="type-meta whitespace-nowrap text-subtle">
          {streakLabel(cells)}
        </span>
      }
    >
      <div className="px-5 pt-1 pb-3">
        {/* Columns are weeks, rows are weekdays — the layout every calendar
            heatmap uses, so the shape is readable without a key. `grid-flow-col`
            fills down each week before moving right. */}
        <div
          className="grid grid-flow-col grid-rows-7 gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {cells.map(({ key, day }) => {
            const total = day?.totalSeconds ?? 0;
            const id = dominantClient(day?.byClient);
            const colour =
              id == null
                ? null
                : ((id === INTERNAL || !inLegend.has(id)
                    ? null
                    : clients.get(id)?.color) ?? NEUTRAL);

            return (
              <div
                key={key}
                title={`${key} — ${total > 0 ? formatCompact(total) : 'nothing tracked'}`}
                className="aspect-square rounded-[2px]"
                style={
                  colour == null
                    ? /* A blank day is the surface it sits on, not a grey
                         chip: the panel's own ground is what says "nothing
                         happened" without drawing a mark for it. */
                      { backgroundColor: 'var(--color-surface-hover)' }
                    : {
                        backgroundColor: colour,
                        /* Density, floored so the lightest worked day is
                           still visibly a day worked. */
                        opacity: 0.25 + 0.75 * Math.min(1, total / peak),
                      }
                }
              />
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {named.map((id) => (
            <Swatch
              key={id}
              colour={clients.get(id)?.color ?? NEUTRAL}
              label={clients.get(id)?.name ?? 'Unknown client'}
            />
          ))}
          {hasOther ? <Swatch colour={NEUTRAL} label="Other" /> : null}
          <span className="ml-auto type-meta text-subtle">
            {formatCompact(yearSeconds)}
          </span>
        </div>
      </div>
    </Region>
  );
}

/**
 * The client's colour, in a row that already names them.
 *
 * `aria-hidden` because the name is right there: a screen reader announcing
 * a colour before every client is noise, not information. Internal work
 * takes the neutral, which reads as worked rather than as unassigned.
 */
function Pip({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden
      className="size-2 flex-none rounded-[2px]"
      style={{ backgroundColor: colour }}
    />
  );
}

function Swatch({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 type-support text-muted">
      <span
        aria-hidden
        className="size-2 flex-none rounded-[2px]"
        style={{ backgroundColor: colour }}
      />
      {label}
    </span>
  );
}

/**
 * The client a day mostly belonged to, or null if nothing was tracked.
 *
 * Ties break on the id so a day split exactly in half keeps the same colour
 * between renders — a cell that flickers between two hues on refetch reads as
 * a bug in the data.
 */
function dominantClient(
  byClient: Record<string, number> | undefined,
): string | null {
  if (!byClient) return null;
  let best: string | null = null;
  let bestSeconds = 0;
  for (const [id, seconds] of Object.entries(byClient)) {
    if (seconds <= 0) continue;
    if (
      seconds > bestSeconds ||
      (seconds === bestSeconds && id < (best ?? ''))
    ) {
      best = id;
      bestSeconds = seconds;
    }
  }
  return best;
}

/**
 * Consecutive worked days back from today, forgiving exactly one gap.
 *
 * A streak that breaks on a single missed day punishes a dentist appointment
 * and stops being a figure anyone trusts. Two missed days is a stop.
 *
 * Today not yet worked does not break it — the day is still in progress.
 */
function streakLabel(cells: { day?: { totalSeconds: number } }[]): string {
  const worked = cells.map((c) => (c.day?.totalSeconds ?? 0) > 0);

  let streak = 0;
  let skipped = 0;
  for (let i = worked.length - 1; i >= 0; i--) {
    if (worked[i]) {
      streak++;
      skipped = 0;
      continue;
    }
    // Today in progress is not a miss; it has not had its chance yet.
    if (i === worked.length - 1) continue;
    skipped++;
    if (skipped > 1) break;
  }

  return streak > 0 ? `${streak} day streak` : 'no streak';
}

/* ── shared shell ─────────────────────────────────────────────────── */

/**
 * A region of the panel, in one of two header modes, selected by `value`.
 *
 * A region whose point is one figure demotes its title to a quiet `type-label`
 * above the figure; a region whose point is a list keeps its heading, having no
 * figure to be subordinate to.
 *
 * No border, no background, no shadow: the panel around it carries all three,
 * and a second set inside it reads as a card in a card.
 */
function Region({
  title,
  icon: Icon,
  iconTone,
  value,
  labelled = false,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /* Neutral unless the region is *about* something being wrong. Never the
     accent, which belongs to the running timer. */
  iconTone?: 'warning';
  /** The region's subject. Supplying it demotes the title — see above. */
  value?: React.ReactNode;
  /**
   * Demote the title without a figure, for a region whose subject is a
   * picture. Month is the one: its answer is the shape of the line against
   * the ray, and a heading would announce it louder than the thing it names.
   */
  labelled?: boolean;
  /** A single quiet control, top-right against the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (value !== undefined || labelled) {
    return (
      <section className="py-1">
        <header className="px-5 pt-3 pb-2">
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
          {/* `leading-none`: no type role sets a line-height, so the inherited
              1.5 leaves ~7px of empty leading under a 30px figure and the line
              beneath it reads as drifting. */}
          {value !== undefined ? (
            <div className="mt-1.5 type-figure leading-none text-strong">
              {value}
            </div>
          ) : null}
        </header>
        {children}
      </section>
    );
  }

  return (
    <section className="py-1">
      <header className="flex items-center gap-2 px-5 pt-3 pb-2.5">
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
  tone,
  actions,
}: {
  href: string;
  icon?: React.ReactNode;
  label: string;
  detail: string;
  value: string;
  tone?: 'danger' | 'warning';
  actions?: React.ReactNode;
}) {
  /* The label is the link and the actions sit beside it, never inside: an <a>
     containing a <button> is invalid HTML and Tab would land inside the link.

     Sized by CONTAINER, not viewport — the same row renders in Home's wide
     panel and in the narrow dock, where a `sm:` breakpoint is true at 1600px
     and lays the row out as though there were room. */
  return (
    <li className="@container">
      <div className="flex items-center gap-2.5 py-2">
        {icon}

        {/* One line: the name, then the age against the money it is ageing.
            Stacked under the name the age read as part of the client rather
            than as a property of the amount, and cost the row a second line
            it did not need. */}
        <Link
          href={href}
          className="min-w-0 flex-1 truncate rounded-sm type-control text-primary hover:underline focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
        >
          {label}
        </Link>

        <span
          className={`flex-none truncate type-meta ${
            tone === 'danger'
              ? 'text-danger'
              : tone === 'warning'
                ? 'text-warning'
                : 'text-subtle'
          }`}
        >
          {detail}
        </span>
        {/* The fixed `w-24` makes the amounts a column where there is room;
            auto-width in a narrow panel. */}
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
