import { formatCompact, formatCurrency } from '@stint/core';
import { TrendingUp } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import type { Beat } from '@/lib/client/use-beat';
import { type Clients, Region } from './home-shell';
import { Money } from './money';

/**
 * The trailing quarter's gross, and how it was made up: a figure, a bar and
 * a key — deliberately not the row shape Unbilled uses.
 * `docs/design/screens/home.html` holds the reasoning.
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

  if (v.byClient.length === 0) return null;

  const gross = (c: (typeof v.byClient)[number]) => c.invoiced + c.unbilled;
  const paid = beat?.kind === 'paid';

  /* Rounded by `buildVelocity`, never divided here: the client does not
     compute money. */
  const perMonth = v.perMonth;

  return (
    <Region
      title="Velocity"
      action={
        <span className="type-meta text-subtle">trailing {v.months}mo</span>
      }
      icon={TrendingUp}
      value={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {/* Fires with Unbilled's countdown, in another region — without the
              pairing, getting paid looks only like the screen's largest
              number shrinking. */}
          <span data-beat={paid ? 'paid' : undefined}>
            <Money
              amount={perMonth}
              currency={stats.currency}
              className={`tabular-nums ${paid ? 'text-success' : ''}`}
            />
          </span>
          <span className="type-duration text-subtle">/mo gross</span>
        </span>
      }
    >
      <div className="flex flex-col gap-2 px-5 pt-1 pb-3">
        <Mix rows={v.byClient} clients={clients} gross={gross} />

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
              <Money
                amount={gross(c)}
                currency={c.currency}
                className="type-meta tabular-nums"
              />
            </span>
          ))}
          {v.moreClients > 0 ? <span>+{v.moreClients} more</span> : null}
        </p>

        <p className="type-meta tabular-nums text-right text-subtle">
          {formatCompact(v.seconds)}
        </p>
      </div>
    </Region>
  );
}

/** Muted so the client hues never out-shout the running timer. */
const MIX_OPACITY = 0.62;

/**
 * One segment per client, sized by share of the gross — so the bar always
 * fills. It answers who the quarter was, not progress toward a target.
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
