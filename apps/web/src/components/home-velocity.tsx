import { formatCurrency } from '@stint/core';
import { TrendingUp } from 'lucide-react';
import type { Stats } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';
import type { Beat } from '@/lib/client/use-beat';
import { type Clients, INSET, Region } from './home-shell';
import { Money } from './money';
import { Swatch } from './swatch';

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
  /* The SEND, not the payment. Raising an invoice is what counts Unbilled
     down, so it is the event whose pairing this half completes — without it,
     invoicing looks only like the screen's largest number shrinking. A
     payment moves neither figure here: the work was done and invoiced
     already, and its own region reports it. */
  const sent = beat?.kind === 'sent';

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
          {/* Fires with Unbilled's countdown, in another region. Neutral:
              the accent's step down marks an outcome, and raising an invoice
              is something the user just did rather than something that
              happened to them. */}
          <span data-beat={sent ? 'sent' : undefined}>
            <Money
              amount={perMonth}
              currency={stats.currency}
              className="type-figure"
            />
          </span>
          <span className="type-duration text-subtle">/mo gross</span>
        </span>
      }
    >
      <div className={`flex flex-col gap-2 ${INSET} pt-1 pb-3`}>
        <Mix rows={v.byClient} clients={clients} gross={gross} />

        <p className="flex flex-wrap gap-x-4 gap-y-1 type-support text-subtle">
          {v.byClient.map((c) => (
            <span
              key={c.clientId ?? 'none'}
              className="flex items-center gap-1.5"
            >
              <Swatch
                color={c.clientId ? clients.get(c.clientId)?.color : null}
                style={{ opacity: MIX_OPACITY }}
              />
              <span className="truncate text-muted">{c.clientName}</span>
              <Money
                amount={gross(c)}
                currency={c.currency}
                className="type-meta"
              />
            </span>
          ))}
          {v.moreClients > 0 ? <span>+{v.moreClients} more</span> : null}
        </p>
      </div>
    </Region>
  );
}

/**
 * Muted so the client hues never out-shout the running timer.
 *
 * Exported because By project paints the same hues beside this bar: a second
 * constant is a second thing to edit, and the two drift the moment one is.
 */
export const MIX_OPACITY = 0.62;

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
