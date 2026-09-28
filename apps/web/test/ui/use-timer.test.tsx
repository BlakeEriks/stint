import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTimer } from '@/lib/client/use-timer';
import type { Summary, TimeEntry } from '@/lib/client/api';

const START = '2026-09-11T09:00:00.000Z';
const NOW_RUNNING = '2026-09-11T09:25:00.000Z';

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
 * Replies to the summary with `data`, and hands each write to `write`. A
 * refetch after the first summary never answers, so anything these tests
 * see after a press came from the press's own response.
 */
function serveWrites(
  data: Summary,
  write: (path: string) => Promise<Response>,
) {
  let summaries = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') !== 'GET')
        return write(String(url).replace('/api/v1', ''));
      if (String(url).includes('/summary') && summaries++ === 0)
        return new Response(JSON.stringify(data), { status: 200 });
      return new Promise<Response>(() => {});
    }),
  );
}

function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('useTimer — between a press and the answer', () => {
  it('is starting, not running, until the server answers', async () => {
    const answer = deferred();
    serveWrites(summary(), () => answer.promise);
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.start.mutate({ taskName: 'Writing' }));

    await waitFor(() => expect(result.current.phase).toBe('starting'));
    expect(result.current.starting?.taskName).toBe('Writing');
    expect(result.current.running).toBeNull();

    await act(async () => answer.resolve(json(entry(), 201)));
    await waitFor(() => expect(result.current.phase).toBe('running'));
  });

  /* The clunk this guards: the start answered, then the bar sat idle until a
     second request — the refetch — came back. */
  it('runs on the start response, without waiting on a refetch', async () => {
    vi.setSystemTime(new Date(START));
    serveWrites(summary({ todaySeconds: 600 }), async () => json(entry(), 201));
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start.mutateAsync({ taskName: 'Writing' });
    });

    await waitFor(() => expect(result.current.phase).toBe('running'));
    expect(result.current.running?.id).toBe('e1');
    expect(result.current.todaySeconds).toBe(600);
  });

  it('takes a failed start back', async () => {
    serveWrites(summary(), async () =>
      json({ code: 'INTERNAL', message: 'Down' }, 500),
    );
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start
        .mutateAsync({ taskName: 'Writing' })
        .catch(() => {});
    });

    await waitFor(() => expect(result.current.start.isError).toBe(true));
    expect(result.current.phase).toBe('idle');
    expect(result.current.running).toBeNull();
  });

  it("shows the other device's timer when the start loses the race", async () => {
    const theirs = entry({ id: 'e2', taskName: 'Their work' });
    serveWrites(summary(), async () =>
      json(
        {
          code: 'TIMER_ALREADY_RUNNING',
          message: 'A timer is already running.',
          details: { running: theirs },
        },
        409,
      ),
    );
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.start
        .mutateAsync({ taskName: 'Writing' })
        .catch(() => {});
    });

    await waitFor(() =>
      expect(result.current.running?.taskName).toBe('Their work'),
    );
  });

  it('is stopping until the server answers, then idle on its response', async () => {
    vi.setSystemTime(new Date(NOW_RUNNING));
    const answer = deferred();
    serveWrites(
      summary({
        running: entry(),
        todaySeconds: 3600 + 1500,
        serverTime: NOW_RUNNING,
      }),
      () => answer.promise,
    );
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    act(() => result.current.stop.mutate());
    await waitFor(() => expect(result.current.phase).toBe('stopping'));

    await act(async () =>
      answer.resolve(json(entry({ endedAt: NOW_RUNNING }))),
    );
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.running).toBeNull();
    // The stopped timer counted once, not dropped and not doubled.
    expect(result.current.todaySeconds).toBe(3600 + 1500);
  });

  it('renames on its response, counting the running timer once', async () => {
    vi.setSystemTime(new Date(NOW_RUNNING));
    serveWrites(
      summary({
        running: entry(),
        todaySeconds: 3600 + 1500,
        serverTime: NOW_RUNNING,
      }),
      async () => json(entry({ taskName: 'Editing' })),
    );
    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    await act(async () => {
      await result.current.update.mutateAsync({ taskName: 'Editing' });
    });

    await waitFor(() =>
      expect(result.current.running?.taskName).toBe('Editing'),
    );
    expect(result.current.todaySeconds).toBe(3600 + 1500);
  });
});
