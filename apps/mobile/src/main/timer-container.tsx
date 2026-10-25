import {
  ApiError,
  keys,
  useFailedPress,
  useTimer,
  type Client,
  type Project,
} from '@stint/client';
import {
  formatClock,
  formatCompact,
  formatCurrency,
  uuidv7,
} from '@stint/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { target } from '../config.ts';
import { SettingsSheet } from '../screens/settings-sheet.tsx';
import type { NoticeProps } from '../screens/parts.tsx';
import {
  type PickerProject,
  type RecentTask,
  TimerScreen,
} from '../screens/timer-screen.tsx';
import type { Api } from '../api.ts';
import { useTimeZone } from './use-time-zone.ts';

const RECENT = 5;

/** The timer screen on the shared timer (`@stint/client`) and the phone's reads. */
export function TimerContainer({
  api,
  email,
  onSignOut,
}: {
  api: Api;
  email: string;
  onSignOut: () => void;
}) {
  const timeZone = useTimeZone();
  const timer = useTimer(api, timeZone);
  const running = timer.running;
  const [settings, setSettings] = useState(false);
  const notice = useNotice(timer.error);

  const stats = useQuery({
    queryKey: keys.stats(timeZone),
    queryFn: () => api.stats(timeZone),
    refetchOnWindowFocus: 'always',
    // Earned moves with a running timer, on the summary's minute.
    refetchInterval: running ? 60_000 : false,
  });
  const projects = useQuery({
    queryKey: keys.projects({ archived: true }),
    queryFn: () => api.projects().then((r) => r.projects),
  });
  const clients = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients().then((r) => r.clients),
  });
  const names = useQuery({
    queryKey: keys.taskNames({}),
    queryFn: () => api.taskNames(RECENT + 1).then((r) => r.taskNames),
  });

  const lookup = projectLookup(projects.data ?? [], clients.data ?? []);
  const recent: RecentTask[] = (names.data ?? [])
    .filter(
      (n) =>
        !(
          running &&
          n.taskName === running.taskName &&
          n.projectId === running.projectId
        ),
    )
    .slice(0, RECENT)
    .map((n) => ({
      taskName: n.taskName,
      projectId: n.projectId,
      projectName: n.projectId ? (lookup(n.projectId)?.name ?? null) : null,
      color: n.projectId ? (lookup(n.projectId)?.color ?? null) : null,
    }));
  const shown = running?.projectId ? lookup(running.projectId) : null;

  const start = (taskName: string, projectId: string | null) =>
    timer.start.mutate({ id: uuidv7(), taskName, projectId });

  return (
    <>
      <TimerScreen
        label={target.label}
        today={wholeMinutes(timer.todaySeconds)}
        earned={
          stats.data
            ? formatCurrency(stats.data.earnedToday, stats.data.currency)
            : null
        }
        recent={recent}
        running={
          running && {
            taskName: running.taskName,
            projectName: shown?.name ?? null,
            clientName: shown?.clientName ?? null,
            color: shown?.color ?? null,
            readout: formatClock(timer.seconds),
          }
        }
        projects={(projects.data ?? [])
          .filter((p) => p.archivedAt === null)
          .map((p) => lookup(p.id) as PickerProject)}
        defaultProjectId={names.data?.[0]?.projectId ?? null}
        notice={notice}
        onStart={start}
        onRecent={(t) => start(t.taskName, t.projectId)}
        onStop={() => timer.stop.mutate()}
        onSettings={() => setSettings(true)}
      />
      <SettingsSheet
        open={settings}
        email={email}
        label={target.label}
        onSignOut={onSignOut}
        onClose={() => setSettings(false)}
      />
    </>
  );
}

/** A refused press first; else the timer's own read failing, which is the network. */
function useNotice(readError: Error | null): NoticeProps | null {
  const failed = useFailedPress();
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
  return null;
}

/** `0m` until the first minute is up, as the menu bar reads. */
function wholeMinutes(seconds: number) {
  const whole = Math.floor(seconds / 60) * 60;
  return whole === 0 ? '0m' : formatCompact(whole);
}

function projectLookup(projects: Project[], clients: Client[]) {
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
  return (id: string) => byId.get(id);
}
