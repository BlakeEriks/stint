'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatClock } from '@stint/core';
import { useTimer, useTimeZone } from '@/lib/client/use-timer';
import { ProjectPicker } from './project-picker';
import { EntryDialog } from './entry-dialog';
import { Button } from '@/components/ui/button';
import { api, type Project, type TimeEntry } from '@/lib/client/api';

/**
 * The hero. A running timer is the only place the accent appears, which is
 * what makes green read as a signal rather than a brand color.
 */
export function TimerBar({ projects }: { projects: Project[] }) {
  const timer = useTimer();
  const [draft, setDraft] = useState('');
  const [draftProject, setDraftProject] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const running = timer.running;
  const isRunning = Boolean(running);

  // While running, the input reflects the server's task name; the user can
  // still edit it, which patches the running entry.
  const [editing, setEditing] = useState<string | null>(null);
  const taskValue = isRunning ? (editing ?? running!.taskName) : draft;

  useEffect(() => {
    if (!isRunning) setEditing(null);
  }, [isRunning]);

  const commitRename = () => {
    if (!isRunning || editing === null) return;
    if (editing !== running!.taskName)
      timer.update.mutate({ taskName: editing });
    setEditing(null);
  };

  const toggle = () => {
    if (isRunning) {
      timer.stop.mutate();
    } else {
      timer.start.mutate({ taskName: draft, projectId: draftProject });
      setDraft('');
    }
  };

  const project = projects.find(
    (p) => p.id === (isRunning ? running!.projectId : draftProject),
  );

  const exceeded = timer.exceedsThreshold;

  /* The runaway choice: keep, adjust, or discard. `principles.md` promises
     the app surfaces the problem and never modifies the entry itself, and
     this is where the user does the modifying. */
  const tz = useTimeZone();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [adjusting, setAdjusting] = useState<TimeEntry | undefined>();

  // A fresh overrun deserves the notice again, even after an earlier dismiss.
  useEffect(() => {
    if (!exceeded) setDismissed(false);
  }, [exceeded]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['summary'] });
    queryClient.invalidateQueries({ queryKey: ['entries'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['calendar'] });
  };

  /* Stop first, then edit. A running entry has no end yet, so there is
     nothing to adjust until it is stopped — and stopping is what the user
     meant by "I left it going". */
  const adjust = useMutation({
    mutationFn: () => api.stopTimer(),
    onSuccess: (entry) => {
      invalidateAll();
      setAdjusting(entry);
    },
  });

  const discard = useMutation({
    mutationFn: async () => {
      const entry = await api.stopTimer();
      await api.deleteEntry(entry.id);
    },
    onSuccess: invalidateAll,
  });

  return (
    <section
      className="rounded-xl border border-edge-subtle bg-surface-primary shadow-card"
      aria-label="Timer"
    >
      {/* Two rows on narrow screens: the task name needs the full width, and
          on one row it collapsed to nothing while the button clipped off. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 sm:flex-nowrap sm:gap-4 sm:p-5">
        <StatusDot running={isRunning} exceeded={exceeded} />

        <input
          ref={inputRef}
          value={taskValue}
          onChange={(e) =>
            isRunning ? setEditing(e.target.value) : setDraft(e.target.value)
          }
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
              if (!isRunning) toggle();
            }
            if (e.key === 'Escape' && isRunning) setEditing(null);
          }}
          placeholder="What are you working on?"
          aria-label="Task name"
          className="order-last min-w-0 flex-1 basis-full bg-transparent type-body
                     text-strong placeholder:text-subtle focus:outline-none
                     sm:order-none sm:basis-auto"
        />

        <ProjectPicker
          projects={projects}
          value={isRunning ? running!.projectId : draftProject}
          onChange={(id) =>
            isRunning
              ? timer.update.mutate({ projectId: id })
              : setDraftProject(id)
          }
          selected={project}
        />

        {/* Readout and control stay together so the control never wraps
            away from the number it acts on. */}
        <div className="ml-auto flex flex-none items-center gap-3 sm:ml-0 sm:gap-4">
          <time
            className={`type-timer
                        ${exceeded ? 'text-warning' : isRunning ? 'text-accent-default' : 'text-subtle'}`}
            aria-live="off"
          >
            {formatClock(timer.seconds)}
          </time>

          <button
            // Explicit: a bare <button> defaults to submit, and this sits
            // beside an input that submits on Enter.
            type="button"
            onClick={toggle}
            disabled={timer.start.isPending || timer.stop.isPending}
            aria-label={isRunning ? 'Stop timer' : 'Start timer'}
            /* text-on-accent is n-0 (14.48:1). Never white here — 1.37:1. */
            className="grid size-9 flex-none place-items-center rounded-full
                       bg-accent-default text-on-accent transition-colors
                       hover:bg-accent-hover disabled:opacity-60"
          >
            {isRunning ? (
              <span className="block size-2.5 rounded-[2px] bg-current" />
            ) : (
              // The button carries the label; the glyph is decoration.
              <svg
                aria-hidden="true"
                viewBox="0 0 10 12"
                className="ml-0.5 block h-3 w-2.5 fill-current"
              >
                <path d="M0 0l10 6-10 6z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {exceeded && !dismissed ? (
        <RunawayNotice
          hours={Math.floor(timer.seconds / 3600)}
          busy={adjust.isPending || discard.isPending}
          onKeep={() => setDismissed(true)}
          onAdjust={() => adjust.mutate()}
          onDiscard={() => discard.mutate()}
        />
      ) : null}

      {/* Opened by Adjust, on the entry that was just stopped. */}
      <EntryDialog
        open={adjusting !== undefined}
        onOpenChange={(open) => {
          if (!open) setAdjusting(undefined);
        }}
        existing={adjusting}
        projects={projects}
        tz={tz}
      />
    </section>
  );
}

function StatusDot({
  running,
  exceeded,
}: {
  running: boolean;
  exceeded: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`size-2.5 flex-none rounded-full ${
        exceeded
          ? 'bg-warning'
          : running
            ? 'bg-accent-default motion-safe:animate-pulse'
            : 'bg-timer-idle'
      }`}
    />
  );
}

/**
 * Surfaced, never auto-corrected. Silently trimming a forgotten timer would
 * mean the app edited billable time without being asked.
 */
function RunawayNotice({
  hours,
  onKeep,
  onAdjust,
  onDiscard,
  busy,
}: {
  hours: number;
  onKeep: () => void;
  onAdjust: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-edge-subtle px-5 py-2.5">
      <p className="min-w-0 flex-1 type-support text-warning">
        This timer has run for {hours} hours.
      </p>

      {confirmingDiscard ? (
        <span className="flex flex-none items-center gap-2">
          <span className="type-support text-muted">Delete this entry?</span>
          <Button
            type="button"
            variant="destructive"
            size="xs"
            disabled={busy}
            onClick={onDiscard}
          >
            Discard
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setConfirmingDiscard(false)}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <span className="flex flex-none items-center gap-1">
          {/* Keep is first and plainest: the timer being long is often
              correct, and the app must not imply otherwise. */}
          <Button type="button" variant="ghost" size="xs" onClick={onKeep}>
            Keep
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={onAdjust}
          >
            Adjust
          </Button>
          {/* Destructive, so it asks. Discarding a 16-hour entry you actually
              worked is not recoverable. */}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => setConfirmingDiscard(true)}
          >
            Discard
          </Button>
        </span>
      )}
    </div>
  );
}
