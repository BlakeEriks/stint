import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { timeZone, useTimer } from '@/lib/client/use-timer';
import { keys } from '@stint/client';
import type { Stats, Summary, TimeEntry } from '@/lib/client/api';
import { localDateKey } from '@stint/core';

const START = '2026-09-11T09:00:00.000Z';

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Writing',
    projectId: null,
    startedAt: START,
    endedAt: null,
    isBillable: true,
    durationSeconds: null,
    ...over,
  } as TimeEntry;
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    running: null,
    todaySeconds: 0,
    weekSeconds: 0,
    serverTime: START,
    ...over,
  };
}

/** Replies to the one endpoint the hook reads. */
function serve(data: Summary) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTimer', () => {
  it('is idle with no running entry', async () => {
    serve(summary());
    const { result } = renderHook(() => useTimer(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.running).toBeNull();
    expect(result.current.seconds).toBe(0);
  });

  it('counts elapsed time from startedAt', async () => {
    // 25 minutes after the timer began.
    vi.setSystemTime(new Date('2026-09-11T09:25:00.000Z'));
    serve(
      summary({
        running: entry(),
        serverTime: '2026-09-11T09:25:00.000Z',
        todaySeconds: 1500,
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    expect(result.current.seconds).toBe(1500);
  });

  /**
   * The bug this guards: `todaySeconds` already includes the running timer,
   * so adding the live count on top double-counts it. At fetch time the two
   * must agree, not sum.
   */
  it('does not double-count the running timer in today total', async () => {
    vi.setSystemTime(new Date('2026-09-11T09:25:00.000Z'));
    serve(
      summary({
        running: entry(),
        // 1h of finished work + the 25min currently running.
        todaySeconds: 3600 + 1500,
        serverTime: '2026-09-11T09:25:00.000Z',
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    // 5100, not 5100 + 1500.
    expect(result.current.todaySeconds).toBe(5100);
  });

  /**
   * The server rounds the running timer into `todaySeconds`; the readout
   * floors. Subtracting the floored figure leaves the rounding's extra second
   * in today's total, one ahead of finished work plus the readout.
   */
  it('keeps today equal to finished work plus the readout mid-second', async () => {
    vi.setSystemTime(new Date('2026-09-11T09:25:00.600Z'));
    serve(
      summary({
        running: entry(),
        // 1h of finished work + 1500.6s running, rounded as the server does.
        todaySeconds: 3600 + 1501,
        serverTime: '2026-09-11T09:25:00.600Z',
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    expect(result.current.seconds).toBe(1500);
    expect(result.current.todaySeconds).toBe(3600 + result.current.seconds);
  });

  it('advances both the timer and today total as the clock ticks', async () => {
    vi.setSystemTime(new Date('2026-09-11T09:25:00.000Z'));
    serve(
      summary({
        running: entry(),
        todaySeconds: 1500,
        serverTime: '2026-09-11T09:25:00.000Z',
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.seconds).toBe(1500));

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.seconds).toBe(1510);
    // Still one count of the running timer, now 10s longer.
    expect(result.current.todaySeconds).toBe(1510);
  });

  /**
   * A device clock several minutes off would otherwise show a wrong elapsed
   * time. `serverTime` is the correction.
   */
  it('corrects for a skewed device clock', async () => {
    // Device believes it is 09:30; the server says 09:25.
    vi.setSystemTime(new Date('2026-09-11T09:30:00.000Z'));
    serve(
      summary({
        running: entry(),
        serverTime: '2026-09-11T09:25:00.000Z',
        todaySeconds: 1500,
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    // The server's 25 minutes, not the device's 30.
    expect(result.current.seconds).toBe(1500);
  });

  it('refreshes every entry-derived view when the timer stops', async () => {
    serve(summary({ running: entry() }));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidated: string[] = [];
    const real = client.invalidateQueries.bind(client);
    client.invalidateQueries = (filters?: {
      queryKey?: readonly unknown[];
    }) => {
      invalidated.push(String(filters?.queryKey?.[0]));
      return real(filters);
    };

    const { result } = renderHook(() => useTimer(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    await act(async () => {
      await result.current.stop.mutateAsync();
    });

    for (const key of ['summary', 'entries', 'stats', 'calendar']) {
      expect(invalidated).toContain(key);
    }
  });
});

/**
 * A server whose answers the test releases by hand. `state` is what
 * `/summary` reports; each held request keeps the answer it would have
 * given when it arrived, the way a slow response is already decided.
 */
function slowServer(initial: Summary) {
  let state = initial;
  const held: Array<{ path: string; release: () => void }> = [];
  const holding = new Set<string>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname.replace('/api/v1', '')}`;
      const body = path.startsWith('GET /summary')
        ? state
        : (state.running ?? {});
      if (holding.has(path)) {
        await new Promise<void>((release) => held.push({ path, release }));
      }
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return {
    set: (next: Partial<Summary>) => {
      state = { ...state, ...next };
    },
    hold: (path: string) => holding.add(path),
    release: (path: string) => {
      holding.delete(path);
      for (const h of held.filter((h) => h.path === path)) h.release();
    },
  };
}

describe('useTimer — every press answers at once', () => {
  it('shows a start as running before the server answers', async () => {
    const server = slowServer(summary());
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    server.hold('POST /timer/start');
    act(() =>
      result.current.start.mutate({
        id: 'new',
        taskName: 'Design',
        projectId: null,
      }),
    );
    await waitFor(() =>
      expect(result.current.running?.taskName).toBe('Design'),
    );

    server.set({ running: entry({ id: 'new', taskName: 'Design' }) });
    server.release('POST /timer/start');
    await waitFor(() => expect(result.current.start.isSuccess).toBe(true));
    expect(result.current.running?.id).toBe('new');
  });

  it('keeps a stopped timer stopped when a rename answers after the stop', async () => {
    const server = slowServer(summary({ running: entry() }));
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    server.hold('PATCH /timer/current');
    act(() => result.current.update.mutate({ taskName: 'Editing' }));
    await waitFor(() =>
      expect(result.current.running?.taskName).toBe('Editing'),
    );

    server.set({ running: null });
    act(() => result.current.stop.mutate());
    // Stopped at once, though the stop waits in the lane behind the rename.
    await waitFor(() => expect(result.current.running).toBeNull());

    server.release('PATCH /timer/current');
    await waitFor(() => expect(result.current.stop.isSuccess).toBe(true));
    expect(result.current.update.isSuccess).toBe(true);
    expect(result.current.running).toBeNull();
  });
});

describe('useTimer — Home settles with the answer', () => {
  function withClient() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const wrap = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, wrap };
  }
  const today = () => {
    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    return keys.entries({ from, to });
  };
  const rows = (client: QueryClient, key: readonly unknown[]) =>
    client.getQueryData<{ entries: TimeEntry[] }>(key)?.entries;

  it('finishes the running row in Today’s list at once when stopped', async () => {
    const running = entry({
      startedAt: new Date(Date.now() - 600_000).toISOString(),
      durationSeconds: 540,
    });
    const server = slowServer(
      summary({ running, serverTime: new Date().toISOString() }),
    );
    const { client, wrap } = withClient();
    const list = today();
    client.setQueryData(list, { entries: [running] });
    const { result } = renderHook(() => useTimer(), { wrapper: wrap });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    server.hold('POST /timer/stop');
    act(() => result.current.stop.mutate());

    await waitFor(() =>
      expect(rows(client, list)?.[0]?.endedAt).not.toBeNull(),
    );
    expect(rows(client, list)?.[0]?.durationSeconds).toBeGreaterThanOrEqual(
      600,
    );
  });

  it('adds the time since /stats measured it to today’s bar when stopped', async () => {
    const running = entry({
      startedAt: new Date(Date.now() - 600_000).toISOString(),
    });
    const server = slowServer(
      summary({ running, serverTime: new Date().toISOString() }),
    );
    const { client, wrap } = withClient();
    const todayKey = localDateKey(new Date(), timeZone);
    const week = [
      { date: '2000-01-01', seconds: 100, amount: null },
      { date: todayKey, seconds: 500, amount: null },
    ];
    client.setQueryData(keys.stats(timeZone), { week } as unknown as Stats, {
      updatedAt: Date.now() - 30_000,
    });
    const { result } = renderHook(() => useTimer(), { wrapper: wrap });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    server.hold('POST /timer/stop');
    act(() => result.current.stop.mutate());

    await waitFor(() =>
      expect(
        client.getQueryData<Stats>(keys.stats(timeZone))?.week[1]?.seconds,
      ).toBeGreaterThanOrEqual(530),
    );
    expect(client.getQueryData<Stats>(keys.stats(timeZone))?.week[0]).toEqual(
      week[0],
    );
  });

  it('grows today’s bar by no more than the running entry when /stats is older', async () => {
    const running = entry({
      startedAt: new Date(Date.now() - 600_000).toISOString(),
    });
    const server = slowServer(
      summary({ running, serverTime: new Date().toISOString() }),
    );
    const { client, wrap } = withClient();
    const todayKey = localDateKey(new Date(), timeZone);
    client.setQueryData(
      keys.stats(timeZone),
      {
        week: [{ date: todayKey, seconds: 500, amount: null }],
      } as unknown as Stats,
      { updatedAt: Date.now() - 3 * 3600_000 },
    );
    const { result } = renderHook(() => useTimer(), { wrapper: wrap });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    server.hold('POST /timer/stop');
    act(() => result.current.stop.mutate());

    await waitFor(() =>
      expect(
        client.getQueryData<Stats>(keys.stats(timeZone))?.week[0]?.seconds,
      ).toBeGreaterThan(500),
    );
    expect(
      client.getQueryData<Stats>(keys.stats(timeZone))?.week[0]?.seconds,
    ).toBeLessThanOrEqual(500 + 601);
  });

  it('adds a started row to the lists whose window holds now', async () => {
    const server = slowServer(
      summary({ serverTime: new Date().toISOString() }),
    );
    const { client, wrap } = withClient();
    const list = today();
    const yesterday = keys.entries({
      from: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      to: new Date(Date.now() - 86_400_000).toISOString(),
    });
    client.setQueryData(list, { entries: [] });
    client.setQueryData(yesterday, { entries: [] });
    const { result } = renderHook(() => useTimer(), { wrapper: wrap });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    server.hold('POST /timer/start');
    act(() => result.current.start.mutate({ id: 'new', taskName: 'Design' }));

    await waitFor(() => expect(rows(client, list)?.[0]?.id).toBe('new'));
    expect(rows(client, yesterday)).toEqual([]);
  });

  it('settles the summary and Home’s figures from the stop’s answer', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(`${init?.method ?? 'GET'} ${url}`);
        const body =
          init?.method === 'POST'
            ? {
                entry: entry({ endedAt: START }),
                included: {
                  summary: summary({ todaySeconds: 3600 }),
                  stats: { settled: true },
                },
              }
            : summary({ running: entry() });
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const { client, wrap } = withClient();
    const invalidated: string[] = [];
    const real = client.invalidateQueries.bind(client);
    client.invalidateQueries = (filters?: {
      queryKey?: readonly unknown[];
    }) => {
      invalidated.push(String(filters?.queryKey?.[0]));
      return real(filters);
    };
    const { result } = renderHook(() => useTimer(), { wrapper: wrap });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    await act(async () => {
      await result.current.stop.mutateAsync();
    });

    expect(urls.find((u) => u.startsWith('POST'))).toMatch(
      /\/timer\/stop\?include=summary,stats&tz=/,
    );
    expect(client.getQueryData(keys.stats(timeZone))).toEqual({
      settled: true,
    });
    expect(client.getQueryData<Summary>(keys.summary())?.todaySeconds).toBe(
      3600,
    );
    expect(invalidated).not.toContain('summary');
    expect(invalidated).not.toContain('stats');
    expect(invalidated).toContain('entries');
  });
});
