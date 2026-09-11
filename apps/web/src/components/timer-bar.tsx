'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@tt/core';
import { useTimer } from '@/lib/client/use-timer';
import { ProjectPicker } from './project-picker';
import type { Project } from '@/lib/client/api';

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
    if (editing !== running!.taskName) timer.update.mutate({ taskName: editing });
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
          className="order-last min-w-0 flex-1 basis-full bg-transparent text-[15px]
                     text-strong placeholder:text-subtle focus:outline-none
                     sm:order-none sm:basis-auto"
        />

        <ProjectPicker
          projects={projects}
          value={isRunning ? running!.projectId : draftProject}
          onChange={(id) =>
            isRunning ? timer.update.mutate({ projectId: id }) : setDraftProject(id)
          }
          selected={project}
        />

        {/* Readout and control stay together so the control never wraps
            away from the number it acts on. */}
        <div className="ml-auto flex flex-none items-center gap-3 sm:ml-0 sm:gap-4">
          <time
            className={`tabular font-mono text-2xl font-medium tracking-tight sm:text-3xl
                        ${exceeded ? 'text-warning' : isRunning ? 'text-accent-default' : 'text-subtle'}`}
            aria-live="off"
          >
            {formatClock(timer.seconds)}
          </time>

          <button
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
              <svg viewBox="0 0 10 12" className="ml-0.5 block h-3 w-2.5 fill-current">
                <path d="M0 0l10 6-10 6z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {exceeded ? <RunawayNotice hours={Math.floor(timer.seconds / 3600)} /> : null}
    </section>
  );
}

function StatusDot({ running, exceeded }: { running: boolean; exceeded: boolean }) {
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
function RunawayNotice({ hours }: { hours: number }) {
  return (
    <p className="border-t border-edge-subtle px-5 py-2.5 text-[13px] text-warning">
      This timer has run for {hours} hours. Stop it and adjust the duration if
      you left it going.
    </p>
  );
}
