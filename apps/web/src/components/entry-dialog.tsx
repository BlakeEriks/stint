'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/client/mutations';
import {
  uuidv7,
  addDays,
  localDateKey,
  localDateTimeToInstant,
  startOfLocalDay,
  startOfLocalDayOffset,
} from '@stint/core';
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
import { ConfirmAction } from '@/components/confirm-action';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TaskSuggest } from '@/components/task-suggest';
import { ProjectPicker } from '@/components/project-picker';
import { EntryScrubber } from '@/components/entry-scrubber';
import { useProjectColors } from '@/lib/client/use-project-colors';
import { api, ApiError, type Project, type TimeEntry } from '@/lib/client/api';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';
import { timeZone } from '@/lib/client/use-timer';

const LABEL = 'type-label text-subtle';

/** The form, as local wall-clock strings. `save` converts to instants. */
interface Draft {
  taskName: string;
  projectId: string | null;
  date: string;
  start: string;
  end: string;
  billable: boolean;
  /** Set once the user changes Billable, after which a project leaves it be. */
  billableTouched: boolean;
}

const EMPTY: Draft = {
  taskName: '',
  projectId: null,
  date: '',
  start: '',
  end: '',
  billable: true,
  billableTouched: false,
};

/**
 * Create, edit or delete a completed time entry.
 *
 * This is the only place a logged entry can be corrected, and correcting one
 * is the whole point: the app promises that the numbers on an invoice are the
 * numbers you worked, which is only true if a mistake can be fixed.
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
  projects,
  onSaved,
  tz = timeZone,
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
  projects: Project[];
  /**
   * Awaited after the dialog closes and before the refetch, so a caller whose
   * list still holds this entry can play it out first. The inbox passes
   * `useExit`'s `mark`; without it the refetch drops the row mid-animation.
   */
  onSaved?: (id: string) => Promise<void> | void;
  /** Overridable so a test can pin a zone; production always uses the real one. */
  tz?: string;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Reset each time it opens, so a canceled edit cannot leak into the next.
  useEffect(() => {
    if (!open) return;
    setError(null);

    const opened = existing ?? seed;
    const from = opened ? new Date(opened.startedAt) : new Date();
    setDraft({
      taskName: existing?.taskName ?? '',
      projectId: existing?.projectId ?? null,
      date: localDateKey(from, tz),
      start: localTime(from, tz),
      end: opened?.endedAt ? localTime(new Date(opened.endedAt), tz) : '',
      billable: existing?.isBillable ?? true,
      billableTouched: false,
    });
  }, [open, existing, seed, tz]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* A new entry takes the project's billable default, as a started timer
     does. An entry that exists keeps the flag the user saved, and a box the
     user changed keeps their answer. */
  const withProject = (d: Draft, projectId: string | null): Draft => ({
    ...d,
    projectId,
    billable:
      existing || d.billableTouched
        ? d.billable
        : (projects.find((p) => p.id === projectId)?.isBillableDefault ?? true),
  });

  /* The close, then the caller, then the refetch — in that order. A list that
     animates this entry out needs it still in the query data while it plays,
     which is only true before the invalidation, which the mutation runs
     after this. */
  const settle = async () => {
    onOpenChange(false);
    if (existing) await onSaved?.(existing.id);
  };

  const failWith = (fallback: string) => (e: Error) =>
    setError(e instanceof ApiError ? e.message : fallback);

  /* Pending, not predicted: the server decides whether an entry is valid (an
     overlap, a billed lock), and a form that closed at once would lose what
     was typed when it said no. The button answers the press instead, and the
     reason shows here. `stats` is in the refetch too: editing an entry
     changes the unbilled total, and giving a loose entry a project is what
     clears its inbox row. */
  const formPress = {
    queryKey: () => keys.entries(),
    invalidate: invalidateEntryData,
    movesHome: true,
    inline: true,
    onSuccess: settle,
  };

  const save = useOptimisticMutation({
    ...formPress,
    mutationFn: async () => {
      const { startedAt, endedAt } = draftInstants(draft, tz);
      const body = {
        taskName: draft.taskName.trim(),
        projectId: draft.projectId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        isBillable: draft.billable,
      };

      return existing
        ? api.updateEntry(existing.id, body)
        : api.createEntry({ id: uuidv7(), ...body });
    },
    onError: failWith('Could not save this entry.'),
  });

  const remove = useOptimisticMutation({
    ...formPress,
    mutationFn: () => api.deleteEntry(existing!.id),
    onError: failWith('Could not delete this entry.'),
  });

  /* An entry billed on an ISSUED invoice is frozen by a database trigger, so
     showing it read-only is honest and offering an edit that will 409 is not.
     A DRAFT is different and the trigger says so — `guard_billed_entry`
     returns early when the invoice status is `draft` — because a draft holds
     no number and has not been sent, so nothing has been told to a client
     yet. Disabling those fields would refuse an edit the server accepts,
     which is the more expensive direction: the fix for a wrong
     draft is to correct the entry and preview again.

     The status is not on the entry, so it is fetched — only when there is an
     invoice to ask about, which is the rare case. */
  const billedOn = useQuery({
    queryKey: keys.invoice(existing?.invoiceId),
    queryFn: () => api.invoice(existing!.invoiceId!),
    enabled: open && existing?.invoiceId != null,
  });

  /* Locked until proven otherwise: while the status is in flight the safe
     assumption is the restrictive one, since the alternative is briefly
     offering fields that are about to disable under the user's cursor. */
  const locked =
    existing?.invoiceId != null && billedOn.data?.status !== 'draft';
  const busy = save.isPending || remove.isPending;

  /* EDITING ONLY. Adjusting is a correction to times that already exist: the
     gesture answers "this started at 9, not 9:30", which is a question a new
     entry has not asked yet. On Add the fields are the whole job, and a strip
     drawn from a default would invite dragging the times into place instead
     of typing the two the user already knows. */
  const colors = useProjectColors();
  const drawn = existing ? strip(draft, tz) : null;

  return (
    <Dialog
      open={open}
      // Closed while a press waits, its refusal would show nowhere: it is inline.
      onOpenChange={(next) => busy || onOpenChange(next)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit entry' : 'Add entry'}</DialogTitle>
          <DialogDescription>
            {description(
              locked,
              existing?.invoiceId != null,
              billedOn.data?.invoiceNumber ?? undefined,
            )}
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
            <TaskSuggest
              value={draft.taskName}
              onChange={(name, rowProject) => {
                setDraft((d) =>
                  /* A fill, never an overwrite: a project already chosen is
                     the user's answer to which client this is billed to, and
                     a row used under another one must not move the work
                     there. */
                  rowProject && !d.projectId
                    ? withProject({ ...d, taskName: name }, rowProject)
                    : { ...d, taskName: name },
                );
              }}
              projectId={draft.projectId}
              /* Naming work is what suggestions accelerate, and an entry that
                 exists is already named — the overlay would cover the field
                 the moment it takes focus, over a value the user came to
                 adjust rather than replace. A billed entry is read-only, so
                 there is nothing to accelerate there either. */
              disabled={locked || existing !== undefined}
            >
              {(suggest) => (
                <Input
                  id="entry-task"
                  {...suggest}
                  autoFocus={focus === 'task'}
                  disabled={locked}
                  placeholder="What did you work on?"
                />
              )}
            </TaskSuggest>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry-project" className={LABEL}>
              Project
            </Label>
            <ProjectPicker
              trigger="field"
              id="entry-project"
              projects={projects}
              value={draft.projectId}
              onChange={(id) => setDraft((d) => withProject(d, id))}
              disabled={locked}
              autoFocus={focus === 'project'}
              /* This is already a dialog, and Radix mounts no dialog inside
                 one — the item would set its state and nothing would appear.
                 Projects are created from the timer bar or `/clients`. */
              canCreate={false}
            />
          </div>

          {/* The strip and the two time fields below are ONE value with two
              controls: a drag rewrites the fields on every pointer move, and
              typing a time redraws the block. */}
          {drawn ? (
            <div className="flex flex-col gap-1.5">
              {/* A caption, not a label: the scrubber it heads is
                  `aria-hidden`, so there is no control for a `<label>` to
                  name. `asChild` keeps the styling and drops the element —
                  the classes are `Label`'s own, so it is unchanged to look
                  at. */}
              <Label asChild className={LABEL}>
                <span>Adjust</span>
              </Label>
              <EntryScrubber
                startedAt={drawn.startedAt}
                endedAt={drawn.endedAt}
                dayStart={drawn.dayStart}
                dayEnd={drawn.dayEnd}
                color={
                  draft.projectId ? colors.get(draft.projectId) : undefined
                }
                disabled={locked}
                tz={tz}
                onChange={({ startedAt, endedAt }) =>
                  setDraft((d) => ({
                    ...d,
                    start: localTime(startedAt, tz),
                    end: localTime(endedAt, tz),
                  }))
                }
              />
            </div>
          ) : null}

          <EntryTimes draft={draft} disabled={locked} set={set} />

          <label className="flex items-center gap-2.5 type-control text-primary">
            <input
              type="checkbox"
              disabled={locked}
              checked={draft.billable}
              onChange={(e) => {
                const billable = e.target.checked;
                setDraft((d) => ({ ...d, billable, billableTouched: true }));
              }}
              className="size-4 accent-[var(--text-muted)]"
            />
            Billable
          </label>

          {error ? (
            <p role="alert" className="type-support text-danger">
              {error}
            </p>
          ) : null}

          <EntryFooter
            locked={locked}
            existing={existing !== undefined}
            saving={save.isPending}
            deleting={remove.isPending}
            onClose={() => onOpenChange(false)}
            onDelete={() => remove.mutate()}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** `14:05` on a wall clock in `tz`. The date half is `localDateKey`. */
function localTime(at: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/**
 * Wall-clock strings to instants. An end at or before the start is an
 * overnight shift — 22:00 to 02:00 — not a typo, so it rolls forward a day:
 * that is what the user meant, and the server would otherwise reject it.
 */
function draftInstants({ date, start, end }: Draft, tz: string) {
  const startedAt = localDateTimeToInstant(date, start, tz);
  const sameDay = localDateTimeToInstant(date, end, tz);
  const endedAt =
    sameDay <= startedAt
      ? localDateTimeToInstant(addDays(date, 1), end, tz)
      : sameDay;
  return { startedAt, endedAt };
}

/**
 * What the scrubber draws, or `null` to hide it: an incomplete draft has
 * nothing to draw, and the strip spans one day, so an overnight entry hides
 * rather than drawing something false. The fields keep the truth and the
 * description explains the rule.
 */
function strip(draft: Draft, tz: string) {
  if (!draft.date || !draft.start || !draft.end) return null;
  const { startedAt, endedAt } = draftInstants(draft, tz);
  const dayStart = startOfLocalDay(startedAt, tz);
  const dayEnd = startOfLocalDayOffset(dayStart, tz, -1);
  if (endedAt >= dayEnd) return null;
  return { startedAt, endedAt, dayStart, dayEnd };
}

function description(
  locked: boolean,
  onInvoice: boolean,
  invoiceNumber: string | undefined,
) {
  if (locked)
    return `This entry is billed on ${invoiceNumber ?? 'an issued invoice'}, so it can no longer be changed. Void the invoice to release it.`;
  if (onInvoice)
    return `This entry is on ${invoiceNumber ? `draft ${invoiceNumber}` : 'a draft'}. Editing it changes what that draft would bill, so preview it again before issuing.`;
  return 'Times are in your local timezone. An end before the start counts as overnight.';
}

/**
 * Date, start and end, in a track that is not three equal columns. A
 * `type="time"` input draws its picker icon inside the box, and an equal
 * share leaves the AM/PM clipped under it, the one part of "05:39 AM" you
 * cannot infer. A `yyyy-mm-dd` is narrower than a time, so the times get
 * `1.2fr` each against the date's `1fr`: the text wants 70px and the icon
 * ~16px.
 */
function EntryTimes({
  draft,
  disabled,
  set,
}: {
  draft: Draft;
  disabled: boolean;
  set: (key: 'date' | 'start' | 'end', value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1.2fr_1.2fr]">
      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor="entry-date" className={LABEL}>
          Date
        </Label>
        <Input
          id="entry-date"
          type="date"
          required
          disabled={disabled}
          value={draft.date}
          onChange={(e) => set('date', e.target.value)}
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
          disabled={disabled}
          value={draft.start}
          onChange={(e) => set('start', e.target.value)}
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
          disabled={disabled}
          value={draft.end}
          onChange={(e) => set('end', e.target.value)}
        />
      </div>
    </div>
  );
}

function EntryFooter({
  locked,
  existing,
  saving,
  deleting,
  onClose,
  onDelete,
}: {
  locked: boolean;
  existing: boolean;
  saving: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (locked) {
    return (
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    );
  }

  const busy = saving || deleting;
  const saveLabel = existing ? 'Save' : 'Add entry';
  // Both actions right-aligned, at the footer's own gap: split to opposite
  // edges, a phone's footer reads them as two unrelated controls.
  return (
    <DialogFooter>
      {/* Deleting is destructive and irreversible, so it asks once. The
          first step only opens that question, so it is a quiet icon: filled
          red belongs on the step that actually destroys something, and
          spending it here trains the user past the one that matters. Weight
          tracks frequency — Save is taken on nearly every open of this
          dialog, Delete on almost none. */}
      {existing ? (
        <ConfirmAction
          /* No visible label, as a destructive first step may be
             (`.claude/rules/web-ui.md`): the confirm that follows spells it
             out before anything is removed. */
          aria-label="Delete entry"
          className="mr-auto"
          label="Delete for good"
          pendingLabel="Deleting…"
          pending={deleting}
          disabled={busy}
          onConfirm={onDelete}
        >
          <Trash2 aria-hidden />
        </ConfirmAction>
      ) : null}

      {/* No icon: Cancel undoes the intent rather than performing one, and a
          glyph would give a dismissal the same weight as the save it sits
          beside. */}
      <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
        Cancel
      </Button>

      {/* Icon plus label, like every other action in the app: text + color +
          icon is more legible than any single channel. The glyph is
          `aria-hidden`, so the accessible name stays the label alone. */}
      <Button type="submit" variant="accent" disabled={busy}>
        {saving ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <Check aria-hidden />
        )}
        {saving ? 'Saving…' : saveLabel}
      </Button>
    </DialogFooter>
  );
}
