'use client';

import { useQuery } from '@tanstack/react-query';
import { formatClock, formatCompact, startOfLocalDay } from '@tt/core';
import { api, type Project, type TimeEntry } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';

/**
 * Today's entries, beneath the timer. This is the view seen 50× a day, so it
 * stays a dense single-line-per-entry list rather than a card grid.
 */
export function EntryList({
  projects,
  todaySeconds,
}: {
  projects: Project[];
  todaySeconds: number;
}) {
  const tz = useTimeZone();
  const from = startOfLocalDay(new Date(), tz).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ['entries', 'today', from],
    queryFn: () => api.entries({ from }),
  });

  // A running entry is shown in the timer bar, not duplicated here.
  const entries = (data?.entries ?? []).filter((e) => e.endedAt !== null);
  const byId = new Map(projects.map((p) => [p.id, p]));

  return (
    <section className="mt-6" aria-label="Today's entries">
      <header className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">
          Today
        </h2>
        <span className="tabular font-mono text-[13px] text-muted">
          {formatClock(todaySeconds)}
        </span>
      </header>

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-primary shadow-card">
        {isLoading ? (
          <Placeholder>Loading…</Placeholder>
        ) : entries.length === 0 ? (
          <Placeholder>
            Nothing logged yet today. Start a timer above.
          </Placeholder>
        ) : (
          <ul>
            {entries.map((entry) => (
              <li key={entry.id}>
                <Row entry={entry} project={byId.get(entry.projectId ?? '')} tz={tz} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({
  entry,
  project,
  tz,
}: {
  entry: TimeEntry;
  project?: Project;
  tz: string;
}) {
  const time = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date(iso));

  return (
    <div className="flex items-center gap-3 border-t border-edge-subtle px-4 py-2.5 first:border-t-0 hover:bg-surface-hover">
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-primary">
        {entry.taskName || <span className="text-subtle">Untitled</span>}
      </span>

      {project ? (
        <span className="hidden flex-none items-center gap-1.5 font-mono text-[11.5px] text-muted sm:flex">
          <span
            aria-hidden
            className="size-1.5 rounded-[2px]"
            style={{ background: project.color ?? 'var(--text-subtle)' }}
          />
          {project.name}
        </span>
      ) : null}

      {!entry.isBillable ? (
        <span className="flex-none rounded border border-edge-default px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider text-subtle">
          Non-billable
        </span>
      ) : null}

      <span className="tabular hidden flex-none font-mono text-[11.5px] text-subtle sm:inline">
        {time(entry.startedAt)} – {entry.endedAt ? time(entry.endedAt) : '—'}
      </span>

      <span className="tabular w-16 flex-none text-right font-mono text-[14px] text-primary">
        {formatCompact(entry.durationSeconds ?? 0)}
      </span>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13.5px] text-subtle">{children}</p>;
}
