import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ActivityChart } from '@/components/activity-chart';

const NOW = '2026-09-12T12:00:00.000Z';

/* Fixed hue per client, matching the project palette. Colour is the client's,
   which is the rule the chart inherits rather than invents. */
const CLIENTS = [
  { id: 'c1', name: 'Northwind Trading', color: '#42B59A' },
  { id: 'c2', name: 'Byrne Studio', color: '#6EA1E2' },
  { id: 'c3', name: 'Acme Co', color: '#35AFC9' },
  { id: 'c4', name: 'Delta Works', color: '#A390DC' },
  { id: 'c5', name: 'Echo Labs', color: '#DA8188' },
  { id: 'c6', name: 'Foxtrot Ltd', color: '#D38B59' },
  { id: 'c7', name: 'Gamma Inc', color: '#B49D46' },
];

type Day = {
  date: string;
  totalSeconds: number;
  byClient: Record<string, number>;
};

function serve(days: Day[], clients = CLIENTS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('/clients')) {
        return new Response(JSON.stringify({ clients }), { status: 200 });
      }
      return new Response(JSON.stringify({ days }), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

interface Band {
  colour: string;
  height: number;
}

/** Every band the chart drew, as {colour, heightPercent}. */
function bands(container: HTMLElement): Band[] {
  return [...container.querySelectorAll<HTMLElement>('[style*="height"]')]
    .filter((el) => el.style.height.endsWith('%'))
    .map((el) => ({
      colour: el.style.backgroundColor,
      height: Number.parseFloat(el.style.height),
    }));
}

/** `bands` indexed, asserting presence — the tests all check a known count. */
function bandAt(drawn: Band[], i: number): Band {
  const band = drawn.at(i);
  if (!band) throw new Error(`expected a band at ${i}, got ${drawn.length}`);
  return band;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ActivityChart', () => {
  it('draws a column for every day in the range, including empty ones', async () => {
    serve([{ date: '2026-09-12', totalSeconds: 3600, byClient: { c1: 3600 } }]);
    const { container } = render(<ActivityChart />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/30 days/)).toBeInTheDocument(),
    );

    /* A blank day is a weekend or a dry spell and both matter — the same
       reason the heatmap rendered all 84 cells. A chart of only worked days
       would hide the rhythm entirely. */
    const columns = container.querySelectorAll('[title]');
    expect(columns).toHaveLength(30);
    expect(
      [...columns].filter((c) =>
        c.getAttribute('title')?.includes('nothing tracked'),
      ).length,
    ).toBe(29);
  });

  it('stacks every client in a split day, not just the largest', async () => {
    /* This is the whole reason the chart replaced the heatmap. A day split
       6h/2h rendered as one solid dominant-hue cell there, and the 2h — the
       share that gets argued about in a scope conversation — was invisible. */
    serve([
      {
        date: '2026-09-12',
        totalSeconds: 28800,
        byClient: { c1: 21600, c2: 7200 },
      },
    ]);
    const { container } = render(<ActivityChart />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Northwind Trading')).toBeInTheDocument(),
    );

    const drawn = bands(container);
    expect(drawn).toHaveLength(2);
    expect(drawn.map((b) => b.colour)).toEqual([
      'rgb(66, 181, 154)',
      'rgb(110, 161, 226)',
    ]);
    /* Largest first, and proportional: 6h of an 8h peak is 75%, 2h is 25%. */
    expect(bandAt(drawn, 0).height).toBeCloseTo(75, 1);
    expect(bandAt(drawn, 1).height).toBeCloseTo(25, 1);
  });

  it('keeps a day total honest when clients overflow the legend', async () => {
    /* Past the top few the hues stop being separable, so the tail merges into
       one neutral band. It must MERGE, not drop: a bar that silently omits
       hours misstates the day, which in a billing tool is the same failure as
       a wrong number on an invoice. */
    const byClient: Record<string, number> = {};
    for (const c of CLIENTS) byClient[c.id] = 3600;
    serve([
      {
        date: '2026-09-12',
        totalSeconds: 3600 * CLIENTS.length,
        byClient,
      },
    ]);
    const { container } = render(<ActivityChart />, { wrapper });

    await waitFor(() => expect(screen.getByText('Other')).toBeInTheDocument());

    const drawn = bands(container);
    /* Five named clients plus one merged band for the remaining two. */
    expect(drawn).toHaveLength(6);
    /* Every hour still on the chart: the seven equal hours are the peak, so
       the stack sums to 100% of the column. */
    expect(drawn.reduce((sum, b) => sum + b.height, 0)).toBeCloseTo(100, 1);
    /* And the merged band is two clients tall, not one. */
    expect(bandAt(drawn, -1).height).toBeCloseTo((2 / 7) * 100, 1);
  });

  it('gives internal work a neutral band rather than dropping it', async () => {
    /* No client, so no hue — but it is not rest either, and a day of internal
       work that rendered as an empty column would read as a day off. */
    serve([{ date: '2026-09-12', totalSeconds: 3600, byClient: { '': 3600 } }]);
    const { container } = render(<ActivityChart />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/30 days/)).toBeInTheDocument(),
    );

    const drawn = bands(container);
    expect(drawn).toHaveLength(1);
    expect(bandAt(drawn, 0).height).toBeCloseTo(100, 1);
    expect(screen.queryByText('Unknown client')).toBeNull();
  });

  it('never spends the accent on a bar', async () => {
    serve([
      {
        date: '2026-09-12',
        totalSeconds: 7200,
        byClient: { c1: 3600, '': 3600 },
      },
    ]);
    const { container } = render(<ActivityChart />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText('Northwind Trading')).toBeInTheDocument(),
    );

    /* Green means the running timer. A bar in the accent would put a second
       green meaning on the one screen the rule exists to protect. */
    for (const band of bands(container)) {
      expect(band.colour).not.toBe('rgb(82, 252, 67)');
    }
    const classes = [container, ...container.querySelectorAll('*')].flatMap(
      (el) => Array.from((el as HTMLElement).classList ?? []),
    );
    expect(classes.filter((c) => c.includes('accent'))).toEqual([]);
  });

  it('asks the server for the period it is showing', async () => {
    serve([{ date: '2026-09-12', totalSeconds: 3600, byClient: { c1: 3600 } }]);
    const user = userEvent.setup();
    const { container } = render(<ActivityChart />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/30 days/)).toBeInTheDocument(),
    );
    expect(container.querySelectorAll('[title]')).toHaveLength(30);

    await user.click(screen.getByRole('radio', { name: 'Last 14 days' }));
    await waitFor(() =>
      expect(container.querySelectorAll('[title]')).toHaveLength(14),
    );

    /* The `from` the component renders and the `from` it requested must be
       the same date. The column count alone does not prove this — it comes
       from local state and changes either way — so this asserts the actual
       request. Without the range in the query key React Query serves the
       30-day response from cache and the chart silently renders 14 columns
       over the wrong window. */
    const calendarCalls = vi
      .mocked(fetch)
      .mock.calls.map(([url]) => String(url))
      .filter((u) => !u.includes('/clients'));

    const windows = calendarCalls.map((u) =>
      new URL(u, 'http://x').searchParams.get('from')?.slice(0, 10),
    );
    expect(new Set(windows).size).toBe(2);
    /* And the latest request is the 14-day window: 13 days back from the
       12th, inclusive of today. */
    expect(windows.at(-1)).toBe('2026-08-30');
  });
});
