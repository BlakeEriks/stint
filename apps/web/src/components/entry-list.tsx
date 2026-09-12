'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatClock, formatCompact, startOfLocalDay } from '@stint/core';
import { Lock, Plus } from 'lucide-react';
import { api, type Project, type TimeEntry } from '@/lib/client/api';
import { useTimeZone } from '@/lib/client/use-timer';
import { useProjectColors } from '@/lib/client/use-project-colors';
import { Button } from '@/components/ui/button';
import { EntryDialog } from './entry-dialog';

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
  const colors = useProjectColors();

  /* `undefined` means "add", an entry means "edit". A separate boolean would
     let the two disagree about which is open. */
  const [editing, setEditing] = useState<TimeEntry | undefined>();
  const [open, setOpen] = useState(false);

  const openFor = (entry?: TimeEntry) => {
    setEditing(entry);
    setOpen(true);
  };

  return (
    <section className="mt-6" aria-label="Today's entries">
      <header className="flex items-baseline justify-between gap-3 px-1 pb-2">
        <h2 className="type-label text-subtle">Today</h2>
        <span className="ml-auto type-duration text-muted">
          {formatClock(todaySeconds)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => openFor()}
        >
          <Plus aria-hidden />
          Add
        </Button>
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
                <Row
                  entry={entry}
                  project={byId.get(entry.projectId ?? '')}
                  color={colors.get(entry.projectId ?? '')}
                  tz={tz}
                  onEdit={() => openFor(entry)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <EntryDialog
        open={open}
        onOpenChange={setOpen}
        existing={editing}
        projects={projects}
        tz={tz}
      />
    </section>
  );
}

function Row({
  entry,
  project,
  color,
  tz,
  onEdit,
}: {
  entry: TimeEntry;
  project?: Project;
  /** The project's client's colour; absent for internal work. */
  color?: string | null;
  tz: string;
  onEdit: () => void;
}) {
  const time = (iso: string) =>
    new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date(iso));

  const locked = entry.invoiceId != null;

  /* The whole row opens the editor — a row is the thing you mean to act on,
     and a dedicated pencil in a dense list is a small target hunting for a
     click. A billed entry still opens: it shows WHY it cannot be changed,
     which a disabled row would not. */
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${entry.taskName || 'untitled entry'}`}
      className="flex w-full items-center gap-3 border-t border-edge-subtle px-4 py-2.5 text-left first:border-t-0 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1 truncate type-control text-primary">
        {entry.taskName || <span className="text-subtle">Untitled</span>}
      </span>

      {project ? (
        <span className="hidden flex-none items-center gap-1.5 type-meta text-muted sm:flex">
          <span
            aria-hidden
            className="size-1.5 rounded-[2px]"
            style={{ background: color ?? 'var(--text-subtle)' }}
          />
          {project.name}
        </span>
      ) : null}

      {!entry.isBillable ? (
        <span className="flex-none rounded border border-edge-default px-1.5 py-px type-badge text-subtle">
          Non-billable
        </span>
      ) : null}

      {/* Billed entries are frozen by a database trigger. Saying so in the
          row means the editor is never a surprise. */}
      {locked ? (
        <Lock
          aria-label="Billed on an issued invoice"
          className="size-3 flex-none text-subtle"
        />
      ) : null}

      <span className="hidden flex-none type-meta text-subtle sm:inline">
        {time(entry.startedAt)} – {entry.endedAt ? time(entry.endedAt) : '—'}
      </span>

      <span className="w-16 flex-none text-right type-duration text-primary">
        {formatCompact(entry.durationSeconds ?? 0)}
      </span>
    </button>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-8 text-center type-support text-subtle">{children}</p>
  );
}
