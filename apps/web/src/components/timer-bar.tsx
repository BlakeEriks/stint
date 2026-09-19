'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { formatClock } from '@stint/core';
import { useTimer } from '@/lib/client/use-timer';
import { useAdjustingEntry } from '@/lib/client/use-runaway';
import { ProjectPicker } from './project-picker';
import { EntryDialog } from './entry-dialog';
import { TaskSuggest } from './task-suggest';
import type { Project } from '@/lib/client/api';

/**
 * The timer, docked to the bottom of the app frame on every screen. A running
 * timer is the only place the accent appears.
 *
 * **The bar is a fixed readout and never grows** — chrome must not reflow at
 * the moment something needs attention. The runaway choice is an inbox row;
 * what stays here is the `EntryDialog` that Adjust opens on the stopped entry.
 */
export function TimerBar({ projects }: { projects: Project[] }) {
  const timer = useTimer();
  const [draft, setDraft] = useState('');
  const [draftProject, setDraftProject] = useState<string | null>(null);

  const running = timer.running;
  const isRunning = Boolean(running);

  /* `null` means "not editing" — the running name is shown as text. Entering
     a rename seeds this with the server's current name, so the draft and the
     mode are one piece of state rather than two that can disagree. */
  const [editing, setEditing] = useState<string | null>(null);

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
      /* Trimmed, as the entry dialog trims: a chosen suggestion has to match
         the stored name exactly or the next list offers it a second time. */
      timer.start.mutate({ taskName: draft.trim(), projectId: draftProject });
      setDraft('');
    }
  };

  const project = projects.find(
    (p) => p.id === (isRunning ? running!.projectId : draftProject),
  );

  const exceeded = timer.exceedsThreshold;

  const [adjusting, setAdjusting] = useAdjustingEntry();

  return (
    <section
      /* A quiet fill rather than a plane of its own: at `xl` the bar sits
         under the panel at the panel's width, and at full opacity it would
         read as a second panel competing with the one being read. No shadow
         and no border for the same reason — the frame has one edge. */
      className="flex flex-none flex-col rounded-xl bg-surface-primary/55"
      aria-label="Timer"
    >
      {/* Identity holds the left edge, the readout the right, so the clock
          lands in the same place in every state — the number a glance goes to
          does not move as the name beside it changes length. `Readout` carries
          the `ml-auto` that does it.

          Running never wraps: below `sm` the project pill is dropped rather
          than wrapped, which leaves a name and a readout, and those fit. Idle
          wraps, because both of its fields are inputs and neither can be
          dropped the way a read-only pill can. */}
      <div
        className={`flex items-center gap-x-3 gap-y-2 px-4 py-2 sm:gap-4 sm:px-5
                    ${isRunning ? 'flex-nowrap' : 'flex-wrap sm:flex-nowrap'}`}
      >
        {isRunning ? (
          <>
            <StatusDot running exceeded={exceeded} />
            <TaskName
              name={running!.taskName}
              editing={editing}
              onEdit={() => setEditing(running!.taskName)}
              onChange={setEditing}
              onCommit={commitRename}
              onCancel={() => setEditing(null)}
            />
            {/* Shown, not offered — `readOnly` is why this is a span. Hidden
                below `sm`: a running timer is glanced at rather than operated,
                and the project cannot change until it stops, so it is the one
                thing on this row that a phone can do without. */}
            <div className="hidden min-w-0 shrink sm:flex">
              <ProjectPicker
                projects={projects}
                value={running!.projectId}
                onChange={(id) => timer.update.mutate({ projectId: id })}
                selected={project}
                readOnly
              />
            </div>
            <Readout
              seconds={timer.seconds}
              exceeded={exceeded}
              running
              onToggle={toggle}
              busy={timer.start.isPending || timer.stop.isPending}
            />
          </>
        ) : (
          <>
            <StatusDot running={false} exceeded={false} />
            {/* `border-edge-default` rather than `border-control`: at rest this
                is a boundary, not a control needing 3:1.

                `order-last basis-full` below `sm` puts the field on its own row
                beneath the dot, tag and clock, which read as one strip. */}
            <TaskSuggest
              value={draft}
              onChange={(name, rowProject) => {
                setDraft(name);
                /* A fill, never an overwrite: a project already chosen is the
                   user's answer to which client this is billed to, and a row
                   used under another one must not move the work there. */
                if (rowProject && !draftProject) setDraftProject(rowProject);
              }}
              projectId={draftProject}
              /* The bar is docked to the bottom of the viewport. */
              above
              className="order-last min-w-0 flex-1 basis-full sm:order-none sm:max-w-md sm:basis-auto"
            >
              {(suggest) => (
                <input
                  {...suggest}
                  onKeyDown={(e) => {
                    suggest.onKeyDown(e);
                    // Enter belongs to the list while a row is highlighted;
                    // otherwise it still starts the timer, as it always did.
                    if (e.key === 'Enter' && !e.defaultPrevented) toggle();
                  }}
                  placeholder="What are you working on?"
                  aria-label="Task name"
                  className="w-full rounded-lg border border-edge-default
                             bg-surface-base px-3 py-2 type-body text-strong
                             placeholder:text-subtle focus:border-edge-focus focus:outline-none"
                />
              )}
            </TaskSuggest>
            <ProjectPicker
              projects={projects}
              value={draftProject}
              onChange={setDraftProject}
              selected={project}
            />
            <Readout
              seconds={timer.seconds}
              exceeded={false}
              running={false}
              onToggle={toggle}
              busy={timer.start.isPending || timer.stop.isPending}
            />
          </>
        )}
      </div>

      {/* Opened by Adjust, on the entry that was just stopped. */}
      <EntryDialog
        open={adjusting !== undefined}
        onOpenChange={(open) => {
          if (!open) setAdjusting(undefined);
        }}
        existing={adjusting}
        projects={projects}
      />
    </section>
  );
}

/**
 * The running task: read by default, edited on request, so a stray click
 * cannot rename billable work.
 *
 * **The pencil is always rendered, never hover-only** — it is the only route
 * to this edit, and touch has no hover.
 *
 * Blur or Enter writes, Escape reverts, an unchanged name writes nothing.
 */
function TaskName({
  name,
  editing,
  onEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  name: string;
  editing: string | null;
  onEdit: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const isEditing = editing !== null;

  /* `focus()` before `select()`: selecting does not focus, and without the
     focus the field opens with no cursor in it and never fires the blur that
     commits the rename. */
  useEffect(() => {
    if (!isEditing) return;
    ref.current?.focus();
    ref.current?.select();
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={ref}
        value={editing}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') onCancel();
        }}
        aria-label="Task name"
        /* `w-48`, not `flex-1`: a field that fills the row would push the tag
           and clock apart the moment you clicked the pencil. */
        className="w-48 min-w-0 shrink rounded-md border border-edge-focus
                   bg-surface-base px-2 py-1 type-body text-strong
                   focus:outline-none sm:w-64"
      />
    );
  }

  return (
    /* Shrinks, never grows: not `flex-1`, so a long name truncates rather
       than walking the pill rightward and pushing the readout off its edge.
       `min-w-0` is what lets `truncate` clip instead of push. */
    <span className="flex min-w-0 shrink items-center gap-1.5">
      {/* `truncate` needs a min-width-0 flex item to clip rather than push. */}
      <span className="min-w-0 truncate type-body text-strong">{name}</span>
      <button
        type="button"
        onClick={onEdit}
        aria-label="Rename task"
        className="grid size-6 flex-none place-items-center rounded-md text-subtle
                   transition-colors hover:bg-surface-hover hover:text-muted
                   focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none"
      >
        <Pencil aria-hidden className="size-3.5" strokeWidth={2} />
      </button>
    </span>
  );
}

/**
 * The clock and its control, one unit so the button can never wrap away from
 * the number it acts on.
 */
function Readout({
  seconds,
  exceeded,
  running,
  onToggle,
  busy,
  className = '',
}: {
  seconds: number;
  exceeded: boolean;
  running: boolean;
  onToggle: () => void;
  busy: boolean;
  className?: string;
}) {
  return (
    /* `ml-auto` is the arrangement: this is what pushes the readout to the
       right edge and leaves identity on the left. */
    <div className={`ml-auto flex flex-none items-center gap-3 ${className}`}>
      <time
        className={`type-timer
                    ${exceeded ? 'text-warning' : running ? 'text-accent-default' : 'text-subtle'}`}
        aria-live="off"
      >
        {formatClock(seconds)}
      </time>

      <button
        // Explicit: a bare <button> defaults to submit, and this sits beside
        // an input that submits on Enter.
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={running ? 'Stop timer' : 'Start timer'}
        /* The accent marks the one action the bar exists to complete, which
           while running is stopping — so Stop is accent and Start is neutral.
           text-on-accent is n-0 (13.61:1). Never white here — 1.37:1. */
        className={`grid size-9 flex-none place-items-center rounded-[9px]
                    transition-colors disabled:opacity-60
                    ${
                      running
                        ? 'bg-accent-default text-on-accent hover:bg-accent-hover'
                        : 'border border-edge-default bg-surface-hover text-primary hover:bg-surface-active'
                    }`}
      >
        {running ? (
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
    /* A status light, not a bullet: 7px with a spread-only ring around it,
       so it reads as lit without another 10px object competing in a row of
       small ones. The ring is an elevation token because it needs an alpha
       and a semantic colour token may not carry one. */
    <span
      aria-hidden
      className={`size-[7px] flex-none rounded-full ${
        exceeded
          ? 'bg-warning shadow-halo-warning motion-safe:animate-pulse'
          : running
            ? 'bg-accent-default shadow-halo-running motion-safe:animate-pulse'
            : 'bg-timer-idle'
      }`}
    />
  );
}
