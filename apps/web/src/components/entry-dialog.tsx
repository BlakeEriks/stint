'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uuidv7 } from '@stint/core';
import { Check, Loader2, Trash2 } from 'lucide-react';
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
  seed,
  focus = 'task',
  onSaved,
  onClosed,
  projects,
  tz,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted for a new entry. */
  existing?: TimeEntry;
  /**
   * Starting times for a new entry, from clicking a time on the calendar.
   * Ignored when `existing` is set — an edit opens on its own times.
   */
  seed?: { startedAt: string; endedAt: string };
  /**
   * Which field takes focus on open. Defaults to the task, which is what a
   * new entry or an ordinary edit starts from — but a caller that opened the
   * dialog to fix ONE field should land the cursor there instead. The inbox's
   * unprojected row is the case: the task name is already correct and the
   * missing project is the entire reason the row exists.
   */
  focus?: 'task' | 'project';
  /**
   * The entry a save or delete just settled, for a caller that is showing a
   * row about it — fired immediately, before the refetch that would drop it.
   *
   * It says which entry changed, never that the row should go: the dialog
   * cannot know why the entry was listed. Renaming a strange-duration entry
   * without fixing its length leaves it strange, and `/stats` returns it
   * again — the caller reconciles.
   */
  onSaved?: (id: string) => void;
  /**
   * The same entry, once this dialog is off the screen. A caller animating
   * that row away starts it here, so the motion is not hidden by the overlay.
   */
  onClosed?: (id: string) => void;
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

    const opened = existing ?? seed;
    const from = opened ? new Date(opened.startedAt) : new Date();
    setDate(localDate(from, tz));
    setStart(localTime(from, tz));
    setEnd(opened?.endedAt ? localTime(new Date(opened.endedAt), tz) : '');
    setBillable(existing?.isBillable ?? true);
  }, [open, existing, seed, tz]);

  /* Claim, close, then refetch and hand over once this dialog is off screen.

     A caller animating a row away needs two different moments, and using one
     for both is what made this invisible twice over:

     **`onSaved` fires immediately**, before `invalidate`. The refetch is what
     drops the row from the caller's list, so refetching first leaves nothing
     to claim and the row blinks out.

     **`onClosed` waits for the overlay to leave the DOM.** A collapse that runs
     underneath it is a movement nobody sees. Waited for, not timed: a fixed
     delay has to guess Radix's exit plus the save's own latency, and measuring
     gave ~510ms where the content's `duration-200` suggested 200.

     `onOpenChange` is synchronous, so the dialog still closes immediately.

     **The watch outlives this component on purpose.** Closing is what unmounts
     it — the caller drops the entry it was editing — so tearing the observer
     down on unmount would cancel the very thing it waits for, every time. A
     timeout bounds it in case the overlay never goes. */
  const settle = (id: string) => {
    onSaved?.(id);
    onOpenChange(false);

    const done = () => {
      invalidate();
      onClosed?.(id);
    };

    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    if (!overlay?.isConnected) {
      done();
      return;
    }

    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      observer.disconnect();
      clearTimeout(bail);
      done();
    };
    const observer = new MutationObserver(() => {
      if (!overlay.isConnected) finish();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const bail = setTimeout(finish, 1000);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
    /* `stats` too: editing an entry changes the unbilled total, and giving a
       loose entry a project is what clears its inbox row. Without this the
       row that opened this dialog still reports the old count afterwards,
       which reads as the save having failed. */
    queryClient.invalidateQueries({ queryKey: ['stats'] });
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
    onSuccess: (entry) => settle(entry.id),
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : 'Could not save this entry.',
      ),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteEntry(existing!.id),
    onSuccess: () => settle(existing!.id),
    onError: (e) =>
      setError(
        e instanceof ApiError ? e.message : 'Could not delete this entry.',
      ),
  });

  /* An entry billed on an ISSUED invoice is frozen by a database trigger, so
     showing it read-only is honest and offering an edit that will 409 is not.
     A DRAFT is different and the trigger says so — `guard_billed_entry`
     returns early when the invoice status is `draft` — because a draft holds
     no number and has not been sent, so nothing has been told to a client
     yet. Disabling those fields refused an edit the server would have
     accepted, which is the more expensive direction: the fix for a wrong
     draft is to correct the entry and preview again.

     The status is not on the entry, so it is fetched — only when there is an
     invoice to ask about, which is the rare case. */
  const billedOn = useQuery({
    queryKey: ['invoices', existing?.invoiceId],
    queryFn: () => api.invoice(existing!.invoiceId!),
    enabled: open && existing?.invoiceId != null,
  });

  /* Locked until proven otherwise: while the status is in flight the safe
     assumption is the restrictive one, since the alternative is briefly
     offering fields that are about to disable under the user's cursor. */
  const locked =
    existing?.invoiceId != null && billedOn.data?.status !== 'draft';
  const busy = save.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit entry' : 'Add entry'}</DialogTitle>
          <DialogDescription>
            {locked
              ? 'This entry is billed on an issued invoice, so it can no longer be changed. Void the invoice to release it.'
              : existing?.invoiceId != null
                ? 'This entry is on a draft invoice. Editing it changes what that draft would bill, so preview it again before issuing.'
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
              autoFocus={focus === 'task'}
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
              /* biome-ignore lint/a11y/noAutofocus: the rule guards against
                 stealing focus on PAGE load. This is a modal the user just
                 opened, where something must take focus — and when the row
                 they clicked exists because the project is missing, this is
                 the field they came for. */
              autoFocus={focus === 'project'}
              disabled={locked}
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || null)}
              /* `focus:` as well as `focus-visible:`. A field focused
                 PROGRAMMATICALLY — as the inbox's unprojected row does on
                 open — is never `:focus-visible`, which the browser reserves
                 for keyboard-driven focus. Without this the cursor is really
                 there and arrow keys work, but nothing on screen says so. */
              className="h-9 rounded-md border border-edge-default bg-transparent px-3
                         type-control text-strong outline-none
                         disabled:opacity-60
                         focus:border-edge-focus focus:ring-[3px] focus:ring-edge-focus
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

          {/* Not four equal columns. A `type="time"` input renders its own
              picker icon inside the box, and at 106.5px minus 24px of padding
              the AM/PM was 4px past the edge — the meridiem clipped under the
              clock, which is the one part of "05:39 AM" you cannot infer.

              The date needs less than the two columns it had (a `yyyy-mm-dd`
              is narrower than two times), so the track gives the times the
              room instead: `1.2fr` each against the date's `1fr`. Measured,
              not guessed — the text wants 70px and the icon ~16px. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1.2fr_1.2fr]">
            <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
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
            // Both actions right-aligned, at the footer's own gap. Splitting
            // them to opposite edges left 134px of empty row in a 293px
            // footer on a phone, which read as two unrelated controls rather
            // than one group.
            <DialogFooter>
              {/* Deleting is destructive and irreversible, so it asks once. */}
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
                    /* Destructive, not ghost. This removes a billing record
                       irreversibly, and a borderless button gave it the same
                       visual weight as Cancel — the channel should match the
                       consequence. It still asks once before anything
                       happens. */
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                )
              ) : null}

              {/* Icon plus label, like every other action in the app: text +
                  colour + icon is more legible than any single channel. The
                  glyph is `aria-hidden`, so the accessible name stays the
                  label alone. */}
              <Button type="submit" size="sm" disabled={busy}>
                {save.isPending ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Check aria-hidden />
                )}
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
