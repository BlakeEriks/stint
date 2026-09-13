'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { formatClock } from '@stint/core';
import { useTimer, useTimeZone } from '@/lib/client/use-timer';
import { useAdjustingEntry } from '@/lib/client/use-runaway';
import { ProjectPicker } from './project-picker';
import { EntryDialog } from './entry-dialog';
import type { Project } from '@/lib/client/api';

/**
 * The timer, docked to the bottom of the app frame on every screen.
 *
 * It used to be a card on Home *and* a readout in the nav rail — two
 * identical green clocks in view at once. `nav-timer.tsx` argued that was
 * fine because "both marks are the same fact, so they reinforce", which was a
 * rationalisation written before anyone looked at it on a wide screen. One
 * timer, in the frame, is the honest version of that rule.
 *
 * Docking it buys three things beyond tidiness:
 *
 * - **A timer can be started from anywhere.** It previously required
 *   navigating to Home first, which put the app's most common action behind a
 *   page load.
 * - **Home gets its best band back.** The hero occupied 87px at the top of
 *   the page and, on a wide screen, held content only in its right ~230px.
 * A running timer is still the only place the accent appears, which is what
 * makes green read as a signal rather than a brand colour.
 *
 * **The bar is a fixed readout and never grows.** The runaway notice used to
 * render above these controls, which pushed the whole frame down at the exact
 * moment something needed attention — chrome reflowing when a problem
 * appears, the same failure the inbox was built to fix as a card that
 * vanished on success. Keep / Adjust / Discard is an inbox row now; what
 * stays here is the `EntryDialog` that Adjust opens on the stopped entry.
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
      timer.start.mutate({ taskName: draft, projectId: draftProject });
      setDraft('');
    }
  };

  const project = projects.find(
    (p) => p.id === (isRunning ? running!.projectId : draftProject),
  );

  const exceeded = timer.exceedsThreshold;

  /* The runaway CHOICE lives in the inbox now — the notice used to grow this
     bar, which put reflowing chrome at the moment a problem appeared. What
     stays here is the editor Adjust opens: the entry it hands over is a
     stopped one, and this is where `EntryDialog` already is. */
  const tz = useTimeZone();
  const [adjusting, setAdjusting] = useAdjustingEntry();

  return (
    <section
      /* `bg-surface-recessed` is the header's surface, not a card's — and a
         step BELOW the rail's `bg-surface-base`. This strip and the header
         bound the whole app, so they sit on the deepest plane and recede
         behind everything scrolling above them. A card surface here would
         read as a panel that happens to be stuck to the bottom. */
      className="flex flex-none flex-col border-t border-edge-subtle bg-surface-recessed"
      aria-label="Timer"
    >
      {/* Running and idle are two arrangements, not one layout with things
          hidden.

          They want opposite things from the width. **Idle** is a composing
          row: the field is the subject and should take the space, so the
          controls push to the edges around it. **Running** is a readout of
          four small objects, and stretching them to the window's corners left
          ~900px of nothing between the dot and the clock — two fragments at
          opposite ends of the screen that read as unrelated. Centred, they
          read as one object, which is what they are.

          **Both wrap to two rows on a phone**, because 375px cannot hold four
          things plus a seven-character clock. Squeezing them onto one line was
          tried and the task name — the most important text in the bar — lost:
          it was crushed to 15px, then to a useless "Ge…" beside an equally
          useless "Sti…". Two truncated words are worse than one whole one.

          The split is by kind, which is also how they group by meaning: WHAT
          you are working on (name, project) on top, HOW LONG and the control
          beneath. Each row is then one idea rather than a queue of fragments,
          and the name gets the full width instead of competing with a clock.
          At `sm` everything is one centred row again. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:gap-4 sm:px-5">
        {isRunning ? (
          <>
            {/* Dot, name and project are ONE flex item, not three.
                Flex-wrap places items before it shrinks them, so as three
                siblings the tag wrapped to a line of its own rather than
                letting the name truncate beside it — three rows where two
                were intended. Grouped, the row shrinks internally and the
                name gives way first, which is the right order: a truncated
                task name beside a whole project tag still reads as one
                statement. */}
            <div className="flex min-w-0 items-center gap-3 sm:contents">
              <StatusDot running exceeded={exceeded} />
              <TaskName
                name={running!.taskName}
                editing={editing}
                onEdit={() => setEditing(running!.taskName)}
                onChange={setEditing}
                onCommit={commitRename}
                onCancel={() => setEditing(null)}
              />
              <ProjectPicker
                projects={projects}
                value={running!.projectId}
                onChange={(id) => timer.update.mutate({ projectId: id })}
                selected={project}
              />
            </div>
            {/* `basis-full` breaks the row here: the clock and its control
                take the second line together. `justify-center` on the
                container centres each row on its own, so neither reads as
                pinned to an edge.

                Grouping the first row into its own element is what keeps the
                split at exactly two; this only has to claim the line. */}
            <Readout
              seconds={timer.seconds}
              exceeded={exceeded}
              running
              onToggle={toggle}
              busy={timer.start.isPending || timer.stop.isPending}
              className="basis-full justify-center sm:basis-auto"
            />
          </>
        ) : (
          <>
            <StatusDot running={false} exceeded={false} />
            {/* The field now looks like a field. Borderless, it read as broken
                rather than ready, and the affordance was invisible until you
                happened to click it. `border-edge-default` rather than
                `border-control`, because at rest this is a boundary rather
                than a control needing 3:1. */}
            {/* `order-last basis-full` below `sm`: the field takes its own
                row beneath the controls. Ordering it LAST rather than first is
                what keeps the row above coherent — dot, tag and clock read
                left to right as one strip, with the thing you type into
                directly under them. */}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') toggle();
              }}
              placeholder="What are you working on?"
              aria-label="Task name"
              className="order-last min-w-0 flex-1 basis-full rounded-lg border border-edge-default
                         bg-surface-base px-3 py-2 type-body text-strong
                         placeholder:text-subtle focus:border-edge-focus focus:outline-none
                         sm:order-none sm:max-w-md sm:basis-auto"
            />
            <ProjectPicker
              projects={projects}
              value={draftProject}
              onChange={setDraftProject}
              selected={project}
            />
            {/* Pushed right on the wrapped row, so the dot and tag sit left
                and the clock anchors the other end rather than the three
                bunching together in the middle. Once the row is one line at
                `sm`, centring takes over again. */}
            <Readout
              seconds={timer.seconds}
              exceeded={false}
              running={false}
              onToggle={toggle}
              busy={timer.start.isPending || timer.stop.isPending}
              className="ml-auto sm:ml-0"
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
        tz={tz}
      />
    </section>
  );
}

/**
 * The running task: read by default, edited on request.
 *
 * It was a live `<input>` the whole time the timer ran, which was wrong in two
 * ways. A running timer is overwhelmingly *read* — you glance at what you are
 * on — and rendering that glance as a focusable text field invites a stray
 * click into an accidental rename of billable work. It also made the bar look
 * like a form that was waiting for you, on every screen, permanently.
 *
 * **The pencil is always rendered, never hover-only.** Hover-to-reveal would
 * hide the only edit affordance on touch, where there is no hover — and this
 * is the one control that has no other route: a name typed wrong at the start
 * is otherwise uncorrectable until the entry is stopped.
 *
 * Editing keeps the old commit rules exactly: blur or Enter writes, Escape
 * reverts, and an unchanged name writes nothing.
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

  /* Focus follows the mode change rather than an event, so the field is ready
     however editing started — the pencil, or a future keyboard shortcut.

     `focus()` before `select()`: selecting does not focus, and without the
     focus the field opens with no cursor in it AND never fires the blur that
     commits the rename. Caught by a test that tabbed away and found the
     field still open. */
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
        /* `w-48`, not `flex-1`: a field that grows to fill the row would
           push the tag and clock apart the moment you clicked the pencil,
           so the bar would jump every time you renamed something. */
        className="w-48 min-w-0 shrink rounded-md border border-edge-focus
                   bg-surface-base px-2 py-1 type-body text-strong
                   focus:outline-none sm:w-64"
      />
    );
  }

  return (
    /* Shrinks, but never grows.

       Deliberately NOT `flex-1`. That was tried and it re-created the problem
       this layout exists to solve: a greedy name fills a wide screen and
       shoves the tag and clock back to the right edge, splitting the running
       timer into two fragments at opposite corners again. The name takes its
       content width and gives way only when there is no room.

       `min-w-[7rem]` is a floor deep enough to stay readable and shallow
       enough to keep the project tag on the same phone row — without it the
       pair needed 338px at 375px and the tag wrapped to a line of its own,
       making three rows out of the intended two. */
    <span className="flex min-w-[7rem] shrink items-center gap-1.5">
      {/* `truncate` needs a min-width-0 flex item to clip rather than push. An
          untruncated long task name would shove the clock off the bar. */}
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
 * The clock and its control, always adjacent.
 *
 * They are one unit so the button can never wrap away from the number it acts
 * on — a stop control that has drifted onto another row from the time it will
 * stop is a misclick waiting to happen.
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
    <div className={`flex flex-none items-center gap-3 sm:gap-4 ${className}`}>
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
        /* text-on-accent is n-0 (13.61:1). Never white here — 1.37:1. */
        className="grid size-9 flex-none place-items-center rounded-full
                   bg-accent-default text-on-accent transition-colors
                   hover:bg-accent-hover disabled:opacity-60"
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
