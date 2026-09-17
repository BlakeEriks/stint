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

/**
 * The home screen's four regions: money waiting, the month, the trailing
 * quarter, then a year of texture.
 *
 * **Nothing here writes.** Every action is a link to the surface that owns
 * the mutation, so a stray click cannot change an invoice.
 *
 * The content column is itself the panel, so no region draws a border, a
 * background or a shadow — a bordered card inside a bordered panel is the
 * disjointedness the frame removed. Regions separate by an inset rule.
 */
export function HomeCards() {
  const { data } = useQuery({
    queryKey: keys.stats(tz),
    queryFn: () => api.stats(tz),
  });

  if (!data) return null;

  return (
    <div className="flex flex-col">
      <Unbilled stats={data} />
      <Month stats={data} />
      <Velocity stats={data} />
      <Heatmap />
    </div>
  );
}

/**
 * Why the figures moved, read off the figures themselves.
 *
 * The beats are reactions to mutations that happen on other screens — the
 * timer bar, the inbox, an invoice — and a region that subscribed to each of
 * them would be a region that knows about all of them. `/stats` is already
 * invalidated by every one, so the refetch carries the news.
 *
 * Marking an invoice paid moves unbilled work into `awaitingPayment` and
 * leaves velocity's total alone; a stop only ever adds. Nothing else on this
 * screen can lower unbilled.
 */
function cause(prev: Stats | null, next: Stats): 'stop' | 'paid' | null {
  if (!prev) return null;
  const moved = next.unbilled.total - prev.unbilled.total;
  if (moved < 0) return 'paid';
  if (moved > 0 || next.unbilled.seconds > prev.unbilled.seconds) return 'stop';
  return null;
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
  const prev = useRef<Stats | null>(null);
  const [beat, setBeat] = useState<Beat>(null);

  useEffect(() => {
    const kind = cause(prev.current, stats);
    const before = prev.current;
    prev.current = stats;
    if (!kind || !before) return;

    setBeat({
      kind,
      amount: stats.unbilled.total - before.unbilled.total,
      seconds: stats.unbilled.seconds - before.unbilled.seconds,
    });
    const t = setTimeout(() => setBeat(null), BEAT_MS);
    return () => clearTimeout(t);
  }, [stats]);

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

  const money = beat.kind === 'paid' ? -beat.amount : beat.amount;
  const billable = Math.abs(beat.amount) > 0;

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

/** One key per origin — a display detail of THIS browser, never account state. */
const SEEN_UNBILLED = 'stint.seen.unbilled';

/**
 * What changed since this browser last looked.
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
    <p className="px-4 py-2 type-support text-subtle">
      Since you last looked,{' '}
      <span className="type-meta tabular-nums text-muted">
        {delta > 0 ? '+' : '−'}
        {formatCurrency(Math.abs(delta), currency)}
      </span>{' '}
      {delta > 0 ? 'unbilled' : 'invoiced'}
    </p>
  );
}

/**
 * The rule between two regions.
 *
 * Inset to the regions' own `px-4`, never a `border-b` on a header: full-bleed
 * it cuts the panel in two and reads as two stacked cards, which is the shape
 * this screen stopped using.
 */
function Rule() {
  return <div className="mx-4 my-1 border-t border-edge-subtle" />;
}

/* ── Unbilled ──────────────────────────────────────────────────────── */

/**
 * Money waiting — the headline number, and the reason this screen exists.
 *
 * Never labelled "earned" or "revenue": it is work done and not yet invoiced,
 * money the user might still never see. Overstating it in a billing tool is
 * the same trust failure as silently editing an entry.
 */
function Unbilled({ stats }: { stats: Stats }) {
  const { total, byClient, moreClients } = stats.unbilled;
  const beat = useBeat(stats);
  const arrival = useSinceLastSeen(SEEN_UNBILLED, total);

  if (byClient.length === 0) return null;

  return (
    <>
      <Region
        title="Unbilled"
        icon={Wallet}
        value={
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular-nums">
              {formatCurrency(arrival.value, stats.currency)}
            </span>
            <Delta beat={beat} currency={stats.currency} />
          </span>
        }
      >
        <ul className="flex flex-col">
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

        <SinceLine delta={arrival.delta} currency={stats.currency} />

        {/* Never added to the total above: that is work not yet invoiced, this
            is money already asked for, and summing them double-counts. */}
        {stats.awaitingPayment > 0 ? (
          <Link
            href="/invoices?status=sent"
            className="flex items-baseline gap-1.5 px-4 py-2 type-support text-subtle hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
          >
            <span className="type-meta text-muted">
              {formatCurrency(stats.awaitingPayment, stats.currency)}
            </span>
            sent, awaiting payment
          </Link>
        ) : null}
      </Region>
      <Rule />
    </>
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
      <>
        <Region title={monthName()} icon={CalendarDays} action={<EditGoal />}>
          <div className="px-4 pt-1 pb-3">
            <p className="type-support text-subtle">
              Set a monthly goal to track hours or revenue against it.
            </p>
          </div>
        </Region>
        <Rule />
      </>
    );
  }

  /* No figure yet means no subject, so the region keeps a heading rather than
     demoting its title above an empty space. */
  if (p.actual == null) {
    return (
      <>
        <Region title={monthName()} icon={CalendarDays} action={<EditGoal />}>
          <div className="px-4 pt-1 pb-3">
            <p className="type-support text-subtle">
              A {p.unit} target is set, but pace in {p.unit} is not computed
              yet.
            </p>
          </div>
        </Region>
        <Rule />
      </>
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
    <>
      <Region
        title={monthName()}
        icon={CalendarDays}
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
        <div className="flex flex-col gap-2 px-4 pt-1 pb-3">
          <PaceLine
            series={p.series}
            target={p.target}
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
      <Rule />
    </>
  );
}

/** Viewport of the pace plot, in its own units — the path is scaled by SVG. */
const PLOT_W = 300;
const PLOT_H = 64;

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
}: {
  series: Pace['series'];
  target: number;
  label: string;
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
      className="h-16 w-full"
      role="img"
      aria-label={label}
    >
      {gap ? (
        <path d={gap} fill="var(--color-text-subtle)" opacity="0.12" />
      ) : null}
      {/* The ray is the reference, so it recedes: dashed and quiet. */}
      <path
        d={rayPath}
        fill="none"
        stroke="var(--color-text-subtle)"
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      {/* Neutral, never the accent: the accent is the running timer. */}
      <path
        d={actualPath}
        fill="none"
        stroke="var(--color-text-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
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
 * The trailing quarter's gross, and where it stands.
 *
 * **"Gross earned", never "earned" alone** — it is work done over the window,
 * not money collected, and the invoiced/unbilled split is what says so. Not
 * comparable with `awaitingPayment`, which spans every period.
 */
function Velocity({ stats }: { stats: Stats }) {
  const v = stats.velocity;
  const beat = useBeat(stats);
  /* Invoiced, not the total: a payment moves money across the split without
     changing the gross, so the total is the one figure that does NOT move on
     the beat this region exists to show. */
  const invoiced = useCountUp(v.invoiced);

  if (v.byClient.length === 0) return null;

  const share = v.total > 0 ? v.invoiced / v.total : 0;
  const paid = beat?.kind === 'paid';

  return (
    <>
      <Region
        title={`Gross earned · last ${v.months} months`}
        icon={TrendingUp}
        value={
          <span className="tabular-nums">
            {formatCurrency(v.total, stats.currency)}
          </span>
        }
      >
        <div className="flex flex-col gap-2 px-4 pt-1 pb-3">
          <div
            className="flex h-1.5 overflow-hidden rounded-full bg-surface-hover"
            role="img"
            aria-label={`${formatCurrency(v.invoiced, stats.currency)} invoiced, ${formatCurrency(v.unbilled, stats.currency)} unbilled`}
          >
            <div
              className="h-full bg-text-muted"
              style={{ width: `${share * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 type-support text-subtle">
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
              <span className="type-meta text-muted">
                {formatCurrency(v.unbilled, stats.currency)}
              </span>{' '}
              unbilled
            </span>
            <span className="ml-auto type-meta">
              {formatCompact(v.seconds)}
            </span>
          </div>
        </div>

        <ul className="flex flex-col">
          {v.byClient.map((c) => (
            <Row
              key={c.clientId ?? 'none'}
              href={c.clientId ? `/clients/${c.clientId}` : '/projects'}
              label={c.clientName}
              detail={
                c.unratedCount > 0
                  ? `${formatCurrency(c.unbilled, c.currency)} unbilled · ${c.unratedCount} unrated`
                  : `${formatCurrency(c.unbilled, c.currency)} unbilled`
              }
              value={formatCurrency(
                /* `0` is a valid figure here: a client whose whole window is
                   still unbilled grosses its unbilled amount, not nothing. */
                c.invoiced + c.unbilled,
                c.currency,
              )}
              secondary={formatCompact(c.seconds)}
            />
          ))}
        </ul>
        {v.moreClients > 0 ? (
          <p className="px-4 py-2 type-support text-subtle">
            +{v.moreClients} more
          </p>
        ) : null}
      </Region>
      <Rule />
    </>
  );
}

/* ── Heatmap ───────────────────────────────────────────────────────── */

/** Internal work: no client, so no hue — but not rest either. */
const INTERNAL = '';
const NEUTRAL = 'var(--color-text-subtle)';

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
      <div className="px-4 pt-1 pb-3">
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
  /** A single quiet control, top-right against the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (value !== undefined) {
    return (
      <section className="py-1">
        <header className="px-4 pt-3 pb-2">
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
        {children}
      </section>
    );
  }

  return (
    <section className="py-1">
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

     Sized by CONTAINER, not viewport — the same row renders in Home's wide
     panel and in the narrow dock, where a `sm:` breakpoint is true at 1600px
     and lays the row out as though there were room. */
  return (
    <li className="@container">
      <div className="flex items-center gap-2.5 px-4 py-2">
        {icon}

        {/* Detail wraps under the label when the panel is narrow rather than
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
