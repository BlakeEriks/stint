'use client';
import { formatCompact } from '@stint/core';
import type { Stats, TimeEntry } from '@/lib/client/api';
import {
  useAllProjects,
  useProject,
  useProjectColors,
} from '@/lib/client/use-project-colors';
import { useScrollerFocus } from '@/lib/client/use-scroller-focus';
import { useTodayEntries } from '@/lib/client/use-today-entries';
import { timeZone as tz } from '@/lib/client/use-timer';
import { Money } from './money';
import { Listing } from './page';
import { FigGroup, FigLabel, PairLine, RegionHead, Pip } from './home-shell';

/**
 * Today: one figure and the day's tasks.
 *
 * The narrow third of the top row — a figure and a few short rows, against
 * the week's chart which wants the long axis.
 */
export function Today({ stats }: { stats: Stats }) {
  const colors = useProjectColors();
  const entries = useTodayEntries();

  return (
    <div className="flex flex-col">
      <RegionHead>Today · {dayLabel(entries.day)}</RegionHead>

      {/* Projects are `also`: if they fail, the rows paint without project
          names rather than the region going blank. Archived included, so a
          project archived since this morning still names the work done under
          it. */}
      <Listing query={entries} also={[useAllProjects()]} tight>
        {(data) => (
          <>
            <FigGroup tier="major" className="mt-4">
              <FigLabel>Earned</FigLabel>
              <PairLine>
                <Money
                  figure="today-earned"
                  amount={stats.earnedToday}
                  currency={stats.currency}
                  className="type-figure text-strong"
                />
                <span className="type-duration text-subtle">
                  {formatCompact(
                    data.reduce((sum, e) => sum + secondsOf(e), 0),
                  )}
                </span>
              </PairLine>
            </FigGroup>
            <Tasks tasks={groupByTask(data)} colors={colors} />
          </>
        )}
      </Listing>
    </div>
  );
}

/* Two, because it is what the region holds beside the week's chart: the
   column keeps the height it will have once the day has work in it, so the
   top row does not change shape at the first entry. */
const PLACEHOLDER_ROWS = 2;

function Tasks({
  tasks,
  colors,
}: {
  tasks: Task[];
  colors: Map<string, string | null>;
}) {
  /* A fixed ceiling rather than the panel's height: the page is a column
     sized by its content, so there is no bounded height to measure against.
     Two and a half rows, so the cut-off row says it scrolls. */
  return (
    <section
      aria-label="Today's tasks"
      tabIndex={useScrollerFocus('all')}
      className="mt-4 flex max-h-[calc(160px+var(--grow,0px))] flex-col overflow-y-auto"
    >
      {tasks.length === 0
        ? /* An empty day keeps its rows rather than collapsing, the same way
             an unworked day in the week's chart keeps its caption: the
             em-dash is what holds the shape. Not a shimmer — nothing is
             loading by the time this renders, and a pulse would promise rows
             that are not coming. No pip either: the hollow ring means
             internal work, and three of them would say the day held three
             untracked entries. */
          Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
            <TaskRow
              key={`empty-${i}`}
              aria-hidden="true"
              data-entry-empty=""
              label={<span className="text-subtle">—</span>}
              project={null}
              duration="—"
            />
          ))
        : tasks.map((t) => (
            <TaskRow
              key={t.key}
              data-task={t.key}
              label={
                <span className={t.live ? 'text-primary' : 'text-muted'}>
                  {t.name}
                </span>
              }
              /* Only clients have a color; internal work takes the hollow
                 ring, which is what having none looks like on a screen
                 otherwise keyed by client. */
              project={
                <>
                  <Pip
                    color={
                      t.projectId ? (colors.get(t.projectId) ?? null) : null
                    }
                  />
                  <ProjectName id={t.projectId} />
                </>
              }
              duration={clock(t.seconds)}
            />
          ))}
    </section>
  );
}

function ProjectName({ id }: { id: string | null }) {
  const name = useProject(id)?.name;
  return name ? <span className="truncate">{name}</span> : null;
}

/** A summary line, placeholder or task: the task's name, and its client's
    pip and project under it, so the name has the row's width. A placeholder's
    second line is empty but kept, so it holds a task row's height. */
function TaskRow({
  label,
  project,
  duration,
  ...attrs
}: {
  label: React.ReactNode;
  project: React.ReactNode;
  duration: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...attrs}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-edge-subtle py-2.5 first:border-t-0"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="type-support truncate">{label}</span>
        <span className="flex min-h-[1lh] items-center gap-1.5 type-support text-subtle">
          {project}
        </span>
      </span>
      <span className="type-duration text-subtle">{duration}</span>
    </div>
  );
}

interface Task {
  key: string;
  name: string;
  projectId: string | null;
  seconds: number;
  live: boolean;
}

/**
 * One row per task: a name under two projects is two tasks. Entries arrive
 * newest first, so a task sits where its latest entry would.
 */
function groupByTask(entries: TimeEntry[]) {
  const tasks = new Map<string, Task>();
  for (const e of entries) {
    const name = e.taskName || 'Untitled';
    const key = taskKey(e.projectId, e.taskName);
    const t = tasks.get(key) ?? {
      key,
      name,
      projectId: e.projectId,
      seconds: 0,
      live: false,
    };
    t.seconds += secondsOf(e);
    t.live ||= e.endedAt === null;
    tasks.set(key, t);
  }
  return [...tasks.values()];
}

function taskKey(projectId: string | null, taskName: string): string {
  return `${projectId ?? ''}:${taskName || 'Untitled'}`;
}

/**
 * `/entries` measures a running entry at its response, so the row and the
 * Earned beside it come from the same refresh rather than the client's clock.
 * Null only for a timer the client has just started and not yet refetched.
 */
function secondsOf(e: TimeEntry): number {
  return e.durationSeconds ?? 0;
}

/** `4:15` — a task's length, beside `5h 00m` for the day's total. */
function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/* Browser locale, like every other date on this screen: a header reading
   "Thursday, Sep 17" beside one reading "17 sept." is the app disagreeing
   with itself. */
function dayLabel(day: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  }).format(day);
}
