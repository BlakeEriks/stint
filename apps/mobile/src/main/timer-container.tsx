import { useFailedPress, useTimer } from '@stint/client';
import { formatClock, formatCurrency, uuidv7 } from '@stint/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking } from 'react-native';
import type { Api } from '../api.ts';
import { target } from '../config.ts';
import { screenReads } from '../reads.ts';
import {
  chooseNotice,
  projectLookup,
  recentTasks,
  wholeMinutes,
} from '../screen-state.ts';
import { SettingsSheet } from '../screens/settings-sheet.tsx';
import type { PickerProject } from '../screens/timer-screen.tsx';
import { TimerScreen } from '../screens/timer-screen.tsx';
import { useNotificationsOff } from './use-notifications.ts';
import { useTimeZone } from './use-time-zone.ts';

/** The timer screen on the shared timer (`@stint/client`) and the phone's reads. */
export function TimerContainer({
  api,
  email,
  onSignOut,
  onNotificationsOn,
}: {
  api: Api;
  email: string;
  onSignOut: () => void;
  /** The notification was just allowed: draw it. */
  onNotificationsOn: () => void;
}) {
  const timeZone = useTimeZone();
  const timer = useTimer(api, timeZone);
  const running = timer.running;
  const [settings, setSettings] = useState(false);
  const failed = useFailedPress();
  const notificationsOff = useNotificationsOff(onNotificationsOn);
  const notice = chooseNotice(
    failed,
    timer.error,
    notificationsOff ? () => void Linking.openSettings() : null,
  );

  const reads = screenReads(api, timeZone);
  const stats = useQuery({
    ...reads.stats,
    refetchOnWindowFocus: 'always',
    // Earned moves with a running timer, once a minute.
    refetchInterval: running ? 60_000 : false,
  });
  const projects = useQuery(reads.projects);
  const clients = useQuery(reads.clients);
  const names = useQuery(reads.taskNames);

  const lookup = projectLookup(projects.data ?? [], clients.data ?? []);
  const recent = recentTasks(names.data ?? [], running, lookup);
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
