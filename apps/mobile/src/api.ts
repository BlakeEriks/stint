import {
  withInclude,
  type Client,
  type Include,
  type Project,
  type StartTimer,
  type Stats,
  type StoppedTimer,
  type Summary,
  type TaskNameSuggestion,
  type TimeEntry,
  type TimerApi,
  type WrittenEntry,
} from '@stint/client';
import type { Request } from './request.ts';

const tz = (zone: string) => `tz=${encodeURIComponent(zone)}`;

/** The reads and writes the phone makes, and nothing more (`docs/mobile.md`). */
export function createApi(request: Request) {
  const api = {
    summary: (zone: string) => request<Summary>('GET', `/summary?${tz(zone)}`),
    stats: (zone: string) => request<Stats>('GET', `/stats?${tz(zone)}`),
    /** Archived included: a running entry on one still shows its name. */
    projects: () =>
      request<{ projects: Project[] }>('GET', '/projects?includeArchived=true'),
    clients: () =>
      request<{ clients: Client[] }>('GET', '/clients?includeArchived=true'),
    /** Newest first, the server's ranking. */
    taskNames: (limit: number) =>
      request<{ taskNames: TaskNameSuggestion[] }>(
        'GET',
        `/entries/task-names?limit=${limit}`,
      ),
    startTimer: (body: StartTimer, include: Include) =>
      request<WrittenEntry>('POST', withInclude('/timer/start', include), body),
    stopTimer: (include?: Include) =>
      request<StoppedTimer>('POST', withInclude('/timer/stop', include), {}),
    updateRunning: (body: { taskName?: string; projectId?: string | null }) =>
      request<TimeEntry>('PATCH', '/timer/current', body),
    /** This phone hears when the timer changes (`push.ts`). */
    registerPushDevice: (token: string) =>
      request<void>('POST', '/push-devices', { token, platform: 'android' }),
    unregisterPushDevice: (token: string) =>
      request<void>('DELETE', '/push-devices', { token }),
  };
  api satisfies TimerApi;
  return api;
}

export type Api = ReturnType<typeof createApi>;
