import Link from 'next/link';
import { formatCompact, formatCurrency } from '@stint/core';
import { Wallet } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { useSinceLastSeen } from '@/lib/client/use-count-up';
import type { Beat } from '@/lib/client/use-day-state';
import { type Clients, Region, Row } from './home-shell';

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

  /* Reports, never praises: "invoiced" is what happened, and a stop that
     earned nothing says the hours it did earn instead.

     `billable` is carried on the beat, decided where the arrival was — never
     re-derived from `amount` here. A net of zero has two causes that look
     identical at this point: genuinely unrated work, and a billable stop that
     a rate edit in the same refetch exactly offset. Reading it as the first
     printed "unbillable" beside work the user is about to invoice. Unknown
     drops the word and reports the hours alone, which is true either way. */
  const text =
    beat.billable === true
      ? `${money >= 0 ? '+' : '−'}${formatCurrency(Math.abs(money), currency)}`
      : beat.billable === false
        ? `+${formatCompact(beat.seconds)} unbillable`
        : `+${formatCompact(beat.seconds)}`;

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
  /* Yields to any stop the beat could not price — unrated work, and the
     net-zero case it will not guess at. Both render hours rather than money,
     and `+$0.00` beside them would contradict the chip. */
  const unbillable = beat && beat.kind === 'stop' && beat.billable !== true;
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
 * Money waiting — the headline number, and the reason this screen exists.
 *
 * Never labelled "earned" or "revenue": it is work done and not yet invoiced,
 * money the user might still never see. Overstating it in a billing tool is
 * the same trust failure as silently editing an entry.
 */
export function Unbilled({
  stats,
  earnedToday,
  beat,
}: {
  stats: Stats;
  earnedToday: number | null;
  beat: Beat;
}) {
  const { total, byClient } = stats.unbilled;
  /* Travel only. This still animates from what this browser last DISPLAYED,
     which is a fact about the screen; the two figures that describe a period
     — today's earnings and the day-over-day line — come from `useDayState`
     and are measured against the day, not against the last paint. */
  const arrival = useSinceLastSeen(SEEN_UNBILLED, total);

  /* The awaiting-payment link lives inside this region, so hiding on an empty
     `byClient` alone took money already asked for down with it: the rollup's
     `having sum(seconds) > 0` empties `byClient` the moment everything is
     invoiced, which is exactly when `awaitingPayment` is the only figure left
     to show. `0` is a valid amount, so this coalesces rather than testing
     truthiness. */
  if (byClient.length === 0 && (stats.awaitingPayment ?? 0) <= 0) return null;

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
export function ByClient({
  stats,
  clients,
}: {
  stats: Stats;
  clients: Clients;
}) {
  const { byClient, moreClients } = stats.unbilled;

  if (byClient.length === 0) return null;

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
                  (c.clientId ? clients.get(c.clientId)?.color : null) ??
                  INTERNAL_SWATCH
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
