'use client';

import { useQuery } from '@tanstack/react-query';
import { formatCompact, startOfLocalDayOffset } from '@stint/core';
import { api } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';

/**
 * Twelve weeks of tracked time, one cell per day.
 *
 * **Hue is the client; intensity is hours.** Each client already carries a
 * colour, so the strip answers *when did the Acme work actually happen?* — a
 * question that comes up in scope discussions and quarterly retros, and which
 * a single-hue ramp cannot answer at all. A day split across clients takes
 * the hue of its largest share.
 *
 * **Never green.** Green `#52FC43` means the running timer, and a green
 * intensity ramp would put a second green meaning on the same screen. Client
 * colours sit over a neutral empty cell; the accent is not used here.
 *
 * **Gaps are information.** For a contractor a blank day is a vacation or a
 * dry spell, and both matter — a clean five-on-two-off rhythm versus a ragged
 * one says something no total does. So the empty cell is a real surface, not
 * a hole: the strip should read as weeks that include rest, not as missing
 * data.
 *
 * Twelve weeks rather than a year: a GitHub-style annual grid works because a
 * commit is binary and the grid is dense. A contractor's year is five days a
 * week with holidays cut out, and at 52 weeks most cells are empty while the
 * rest are the same shade.
 */
const WEEKS = 12;
const DAYS = WEEKS * 7;

export function ActivityStrip() {
  const tz = useTimeZone();
  const now = new Date();

  // Whole weeks back from the start of the current week, so columns align.
  const from = startOfLocalDayOffset(now, tz, DAYS - 1);

  const { data } = useQuery({
    queryKey: ['activity', tz],
    queryFn: () =>
      api.activity({
        from: from.toISOString(),
        to: now.toISOString(),
        tz,
      }),
  });

  const { data: clientData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients({ includeArchived: true }),
  });

  if (!data) return null;

  const clients = new Map((clientData?.clients ?? []).map((c) => [c.id, c]));
  const byDate = new Map(data.days.map((d) => [d.date, d]));

  // The busiest day sets the scale, so a quiet quarter still shows contrast.
  const peak = Math.max(...data.days.map((d) => d.totalSeconds), 1);

  /* Oldest first, and pad to whole weeks so the columns are not ragged. */
  const cells = Array.from({ length: DAYS }, (_, i) => {
    const at = startOfLocalDayOffset(now, tz, DAYS - 1 - i);
    const key = localKey(at, tz);
    const day = byDate.get(key);
    return { key, at, day };
  });

  return (
    <section className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-elevated shadow-card">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-2.5">
        <h2 className="type-heading text-strong">Activity</h2>
        <span className="type-meta text-subtle">last {WEEKS} weeks</span>
      </header>
      {/* Inset to the content's own padding, matching the home cards — see
          the `Card` shell in `home-cards.tsx` for why it is not a border on
          the header itself. */}
      <div className="mx-4 border-t border-edge-subtle" />

      <div className="overflow-x-auto px-4 pt-3 pb-4">
        {/* Columns are weeks, rows are weekdays — the orientation everyone
            already reads from commit graphs. */}
        <div
          className="grid grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
        >
          {cells.map(({ key, day }) => {
            const dominant = dominantClient(day?.byClient);
            const colour = dominant ? clients.get(dominant)?.color : null;
            const intensity = day ? day.totalSeconds / peak : 0;

            return (
              <div
                key={key}
                title={`${key} — ${day ? formatCompact(day.totalSeconds) : 'nothing tracked'}`}
                className="size-[11px] flex-none rounded-[2px] bg-surface-hover"
                style={
                  day && day.totalSeconds > 0
                    ? {
                        // Colour at the day's intensity over the empty
                        // surface. Internal work has no client colour, so it
                        // falls back to a neutral that still reads as worked.
                        backgroundColor: colour ?? 'var(--text-subtle)',
                        // Floor at 0.25 so a short day is visible rather than
                        // indistinguishable from rest.
                        opacity: 0.25 + 0.75 * Math.min(1, intensity),
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** The client with the largest share of a day, or null for an empty day. */
function dominantClient(
  byClient: Record<string, number> | undefined,
): string | null {
  if (!byClient) return null;
  let best: string | null = null;
  let bestSeconds = 0;
  for (const [id, seconds] of Object.entries(byClient)) {
    if (seconds > bestSeconds) {
      bestSeconds = seconds;
      // `''` is internal work, which has no client and therefore no colour.
      best = id === '' ? null : id;
    }
  }
  return best;
}

function localKey(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
