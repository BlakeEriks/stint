import { formatCompact, formatCurrency } from '@stint/core';
import { TrendingUp } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import { useCountUp } from '@/lib/client/use-count-up';
import type { Beat } from '@/lib/client/use-day-state';
import { type Clients, Region } from './home-shell';

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
export function Velocity({
  stats,
  beat,
  clients,
}: {
  stats: Stats;
  beat: Beat;
  clients: Clients;
}) {
  const v = stats.velocity;
  /* Invoiced, not the total: a payment moves money across the split without
     changing the gross, so the total is the one figure that does NOT move on
     the beat this region exists to show. */
  const invoiced = useCountUp(v.invoiced);

  if (v.byClient.length === 0) return null;

  /* `0` is a valid figure: a client whose whole window is still unbilled
     grosses its unbilled amount, not nothing. */
  const gross = (c: (typeof v.byClient)[number]) => c.invoiced + c.unbilled;
  const paid = beat?.kind === 'paid';

  /* Per month, which is what makes two windows comparable. Rounded by
     `buildVelocity`, never divided here: the client does not compute money. */
  const perMonth = v.perMonth;

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
        <Mix rows={v.byClient} clients={clients} gross={gross} />

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
                    (c.clientId ? clients.get(c.clientId)?.color : null) ??
                    INTERNAL_SWATCH,
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
  rows,
  clients,
  gross,
}: {
  rows: Stats['velocity']['byClient'];
  clients: Clients;
  gross: (c: Stats['velocity']['byClient'][number]) => number;
}) {
  const total = rows.reduce((sum, c) => sum + gross(c), 0);
  if (total <= 0) return null;

  return (
    <div
      className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
      role="img"
      aria-label={rows
        .map((c) => `${c.clientName} ${formatCurrency(gross(c), c.currency)}`)
        .join(', ')}
    >
      {rows.map((c) => (
        <div
          key={c.clientId ?? 'none'}
          className="h-full rounded-full"
          style={{
            width: `${(gross(c) / total) * 100}%`,
            backgroundColor:
              (c.clientId ? clients.get(c.clientId)?.color : null) ??
              INTERNAL_SWATCH,
            opacity: MIX_OPACITY,
          }}
        />
      ))}
    </div>
  );
}
