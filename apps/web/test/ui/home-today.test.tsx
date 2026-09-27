import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Today } from '@/components/home-today';
import type { Stats } from '@/lib/client/api';

/**
 * Today's list is the user's local day, not the UTC one: in New York a UTC
 * day starts at 8 PM the evening before, which put Saturday's work under
 * Sunday.
 */

vi.mock('@/lib/client/use-timer', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  timeZone: 'America/New_York',
}));

const STATS = { currency: 'USD', earnedToday: 0 } as Stats;

let fetchMock: ReturnType<typeof vi.fn>;
let client: QueryClient;

function entryQueries() {
  return fetchMock.mock.calls
    .map(([url]) => new URL(String(url), 'http://localhost'))
    .filter((u) => u.pathname.endsWith('/entries'))
    .map((u) => [u.searchParams.get('from'), u.searchParams.get('to')]);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes('/projects')
      ? new Response(JSON.stringify({ projects: [] }), { status: 200 })
      : new Response(JSON.stringify({ entries: [] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderToday() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Today stats={STATS} />
    </QueryClientProvider>,
  );
}

describe('Today', () => {
  it('asks for local midnight to local midnight', async () => {
    // Sunday 27 Sep, 10 AM in New York.
    vi.setSystemTime(new Date('2026-09-27T14:00:00.000Z'));
    renderToday();

    await waitFor(() =>
      expect(entryQueries()).toEqual([
        ['2026-09-27T04:00:00.000Z', '2026-09-28T03:59:59.999Z'],
      ]),
    );
  });

  it('moves to the new day when the tab stays open past midnight', async () => {
    // Saturday 26 Sep, 11:59 PM in New York.
    vi.setSystemTime(new Date('2026-09-27T03:59:00.000Z'));
    renderToday();
    await waitFor(() => expect(entryQueries()).toHaveLength(1));
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    await waitFor(() =>
      expect(entryQueries().at(-1)).toEqual([
        '2026-09-27T04:00:00.000Z',
        '2026-09-28T03:59:59.999Z',
      ]),
    );
    // Earned comes from `/stats`, so the new day refetches it too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stats'] });
  });

  it('leaves stats alone while the day is unchanged', async () => {
    vi.setSystemTime(new Date('2026-09-27T14:00:00.000Z'));
    renderToday();
    await waitFor(() => expect(entryQueries()).toHaveLength(1));
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(invalidate).not.toHaveBeenCalled();
    expect(entryQueries()).toHaveLength(1);
  });
});
