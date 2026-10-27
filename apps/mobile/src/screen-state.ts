import {
  ApiError,
  type Client,
  type Project,
  type TaskNameSuggestion,
} from '@stint/client';
import { formatCompact } from '@stint/core';
import type { NoticeProps } from './screens/parts.tsx';
import type { PickerProject, RecentTask } from './screens/timer-screen.tsx';

const RECENT = 5;
/** One more than Recent shows, since the running task is left out. */
export const RECENT_FETCHED = RECENT + 1;

export type Lookup = (id: string) => PickerProject | undefined;

/** Each project as the picker and Recent show it: its client's name and color. */
export function projectLookup(projects: Project[], clients: Client[]): Lookup {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const byId = new Map(
    projects.map((p): [string, PickerProject] => {
      const client = p.clientId ? clientById.get(p.clientId) : undefined;
      return [
        p.id,
        {
          id: p.id,
          name: p.name,
          clientName: client?.name ?? null,
          color: client?.color ?? null,
        },
      ];
    }),
  );
  return (id) => byId.get(id);
}

/** The five newest task names, newest first, the running task left out. */
export function recentTasks(
  names: TaskNameSuggestion[],
  running: { taskName: string; projectId: string | null } | null,
  lookup: Lookup,
): RecentTask[] {
  return names
    .filter(
      (n) =>
        !(
          running &&
          n.taskName === running.taskName &&
          n.projectId === running.projectId
        ),
    )
    .slice(0, RECENT)
    .map((n) => {
      const project = n.projectId ? lookup(n.projectId) : undefined;
      return {
        taskName: n.taskName,
        projectId: n.projectId,
        projectName: project?.name ?? null,
        color: project?.color ?? null,
      };
    });
}

/**
 * A refused press first; else the timer's own read failing, which is the
 * network. A rejected session is no notice: it signs out.
 */
export function chooseNotice(
  failed: { message: string; dismiss: () => void } | null,
  readError: Error | null,
  /** Notifications are off: opens the phone's settings for Stint. */
  turnOnNotifications?: (() => void) | null,
): NoticeProps | null {
  if (failed)
    return {
      message: failed.message,
      tone: 'error',
      onDismiss: failed.dismiss,
    };
  if (readError && !(readError instanceof ApiError && readError.isUnauthorized))
    return {
      message: 'Can’t reach Stint. Check your internet connection.',
      tone: 'offline',
    };
  if (turnOnNotifications)
    return {
      tone: 'warning',
      message: 'Notifications are off, so a running timer isn’t pinned.',
      action: { label: 'Turn on', onPress: turnOnNotifications },
    };
  return null;
}

/**
 * Whether the running timer's notification can show: `ask` while Android
 * will still prompt, `off` once it won't (refused twice, or turned off in
 * Settings), which the screen then says (Principle I).
 */
export function notificationAccess(p: {
  granted: boolean;
  canAskAgain: boolean;
}): 'on' | 'ask' | 'off' {
  if (p.granted) return 'on';
  return p.canAskAgain ? 'ask' : 'off';
}

/** `0m` until the first minute is up, as the menu bar reads. */
export function wholeMinutes(seconds: number): string {
  const whole = Math.floor(seconds / 60) * 60;
  return whole === 0 ? '0m' : formatCompact(whole);
}
