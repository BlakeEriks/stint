import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTimer } from '@/lib/client/use-timer';
import type { Summary, TimeEntry } from '@/lib/client/api';

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
    exceedsThreshold: false,
    maxTimerHours: 8,
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

  it('flags a timer past the configured threshold', async () => {
    // 9h against an 8h threshold.
    vi.setSystemTime(new Date('2026-09-11T18:00:00.000Z'));
    serve(
      summary({
        running: entry(),
        maxTimerHours: 8,
        serverTime: '2026-09-11T18:00:00.000Z',
        todaySeconds: 32_400,
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    expect(result.current.exceedsThreshold).toBe(true);
    // Surfaced, never trimmed.
    expect(result.current.seconds).toBe(32_400);
  });

  it('leaves a timer under the threshold unflagged', async () => {
    vi.setSystemTime(new Date('2026-09-11T16:59:00.000Z'));
    serve(
      summary({
        running: entry(),
        maxTimerHours: 8,
        serverTime: '2026-09-11T16:59:00.000Z',
        todaySeconds: 28_740,
      }),
    );

    const { result } = renderHook(() => useTimer(), { wrapper });
    await waitFor(() => expect(result.current.running).not.toBeNull());

    expect(result.current.exceedsThreshold).toBe(false);
  });
});
