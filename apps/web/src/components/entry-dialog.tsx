'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from '@stint/core';
import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, type Project, type TimeEntry } from '@/lib/client/api';

const LABEL = 'type-label text-subtle';

/**
 * Create, edit or delete a completed time entry.
 *
 * This is the only place a logged entry can be corrected, and correcting one
 * is the whole point: the app promises that the numbers on an invoice are the
 * numbers you worked, which is only true if a mistake can be fixed. It is
 * also what makes the runaway-timer warning honest — "surfaces, never
 * auto-trims" requires somewhere for the user to do the trimming.
 *
 * A running entry is not editable here. Its end does not exist yet, and the
 * timer bar already owns retitling and reassigning it mid-run.
 */
export function EntryDialog({
  open,
  onOpenChange,
  existing,
  projects,
  tz,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted for a new entry. */
  existing?: TimeEntry;
  projects: Project[];
  tz: string;
}) {
  const queryClient = useQueryClient();

  const [taskName, setTaskName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset each time it opens, so a cancelled edit cannot leak into the next.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmingDelete(false);
    setTaskName(existing?.taskName ?? '');
    setProjectId(existing?.projectId ?? null);

    const from = existing ? new Date(existing.startedAt) : new Date();
    setDate(localDate(from, tz));
    setStart(localTime(from, tz));
    setEnd(existing?.endedAt ? localTime(new Date(existing.endedAt), tz) : '');
    setBillable(existing?.isBillable ?? true);
  }, [open, existing, tz]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const startedAt = toInstant(date, start, tz);
      const endedAt = toInstant(date, end, tz);

      /* An entry that ends "before" it starts is almost always an overnight
         shift — 22:00 to 02:00 — not a typo. Rolling the end forward a day is
         what the user meant, and the server would otherwise reject it. */
      const ended =
        endedAt <= startedAt ? addDays(endedAt, 1, tz, date, end) : endedAt;

      const body = {
        taskName: taskName.trim(),
        projectId,
        startedAt: startedAt.toISOString(),
        endedAt: ended.toISOString(),
        isBillable: billable,
      };

      return existing
        ? api.updateEntry(existing.id, body)
        : api.createEntry({ id: uuidv7(), ...body });
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : 'Could not save this entry.',
      ),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteEntry(existing!.id),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
    },
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : 'Could not delete this entry.',
      ),
  });

  /* An entry billed on an issued invoice is frozen by a database trigger.
     Showing it read-only is honest; offering an edit that will 409 is not. */
  const locked = existing?.invoiceId != null;
  const busy = save.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit entry' : 'Add entry'}</DialogTitle>
          <DialogDescription>
            {locked
              ? 'This entry is billed on an issued invoice, so it can no longer be changed. Void the invoice to release it.'
              : 'Times are in your local timezone. An end before the start counts as overnight.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-task" className={LABEL}>
              Task
            </Label>
            <Input
              id="entry-task"
              autoFocus
              disabled={locked}
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What did you work on?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-project" className={LABEL}>
              Project
            </Label>
            <select
              id="entry-project"
              disabled={locked}
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
              className="h-9 rounded-md border border-edge-default bg-transparent px-3
                         type-control text-strong outline-none
                         disabled:opacity-60
                         focus-visible:border-edge-focus focus-visible:ring-[3px]
                         focus-visible:ring-edge-focus"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="entry-date" className={LABEL}>
                Date
              </Label>
              <Input
                id="entry-date"
                type="date"
                required
                disabled={locked}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-start" className={LABEL}>
                Start
              </Label>
              <Input
                id="entry-start"
                type="time"
                required
                disabled={locked}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-end" className={LABEL}>
                End
              </Label>
              <Input
                id="entry-end"
                type="time"
                required
                disabled={locked}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 type-control text-primary">
            <input
              type="checkbox"
              disabled={locked}
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="size-4 accent-[var(--text-muted)]"
            />
            Billable
          </label>

          {error ? (
            <p role="alert" className="type-support text-danger">
              {error}
            </p>
          ) : null}

          {locked ? (
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter className="sm:justify-between">
              {/* Deleting is destructive and irreversible, so it asks once.
                  Nothing here is the primary action, so nothing is accent. */}
              {existing ? (
                confirmingDelete ? (
                  <span className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => remove.mutate()}
                    >
                      Delete for good
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                )
              ) : (
                <span />
              )}

              <Button type="submit" disabled={busy}>
                {save.isPending ? 'Saving…' : existing ? 'Save' : 'Add entry'}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── local wall-clock <-> instant ──────────────────────────────────
   The inputs are wall-clock in the user's timezone; the API is UTC. These
   convert without fixed-millisecond arithmetic, for the same reason the
   calendar uses `startOfLocalDayOffset`: a day containing a DST transition is
   not 24 hours long, so adding 86_400_000 lands an hour off. */

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return Object.fromEntries(
    f.formatToParts(at).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
}

function localDate(at: Date, tz: string) {
  const p = parts(at, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

function localTime(at: Date, tz: string) {
  const p = parts(at, tz);
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/**
 * The instant at which `date` + `time` reads on a wall clock in `tz`.
 *
 * Resolved by guessing UTC and correcting by the offset that guess lands in,
 * which is the standard trick and is DST-correct: the correction is computed
 * *at* the target instant rather than assumed from today.
 */
function toInstant(date: string, time: string, tz: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const [hh = 0, mm = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = parts(new Date(guess), tz);
  const landed = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === '24' ? 0 : p.hour),
    Number(p.minute),
  );
  return new Date(guess + (guess - landed));
}

/** Same wall-clock time, `n` days later — via the calendar, not milliseconds. */
function addDays(_at: Date, n: number, tz: string, date: string, time: string) {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  const iso = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return toInstant(iso, time, tz);
}
