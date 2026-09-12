import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ActivityStrip } from '@/components/activity-strip';

const NOW = '2026-09-12T15:00:00.000Z';

/* Palette entries from tokens.json, not invented hexes. */
const BLUE = '#6EA1E2';
const GREEN = '#42B59A';

function serve(
  days: {
    date: string;
    totalSeconds: number;
    byClient: Record<string, number>;
  }[],
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/clients')) {
        return new Response(
          JSON.stringify({
            clients: [
              { id: 'c1', name: 'Northwind', color: BLUE },
              { id: 'c2', name: 'Byrne', color: GREEN },
            ],
          }),
          { status: 200 },
        );
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cells = (c: HTMLElement) => [...c.querySelectorAll('div[title]')];

describe('ActivityStrip', () => {
  it('draws a full twelve weeks, including the empty days', async () => {
    serve([{ date: '2026-09-11', totalSeconds: 3600, byClient: { c1: 3600 } }]);
    const { container } = render(<ActivityStrip />, { wrapper });

    /* Gaps are information: a blank day is a vacation or a dry spell, and a
       strip that only rendered worked days would hide the rhythm entirely. */
    await waitFor(() => expect(cells(container).length).toBe(84));
  });

  it('colours a day by its client, never by the accent', async () => {
    serve([
      { date: '2026-09-11', totalSeconds: 7200, byClient: { c1: 7200 } },
      { date: '2026-09-10', totalSeconds: 7200, byClient: { c2: 7200 } },
    ]);
    const { container } = render(<ActivityStrip />, { wrapper });

    await waitFor(() => expect(cells(container).length).toBe(84));
    const styles = cells(container).map((c) => c.getAttribute('style') ?? '');

    /* Hue is the CLIENT — a single-hue ramp cannot answer "when did the Acme
       work happen?". And never green #52FC43: that means the running timer,
       and a green ramp here would put a second green meaning on the screen. */
    expect(
      styles.some(
        (s) => s.includes('110, 161, 226') || s.includes(BLUE.toLowerCase()),
      ),
    ).toBe(true);
    expect(
      styles.some(
        (s) => s.includes('66, 181, 154') || s.includes(GREEN.toLowerCase()),
      ),
    ).toBe(true);
    expect(
      styles.some((s) => s.includes('82, 252, 67') || s.includes('52fc43')),
    ).toBe(false);
  });

  it("takes the hue of the day's largest share when split", async () => {
    serve([
      {
        date: '2026-09-11',
        totalSeconds: 10800,
        byClient: { c1: 3600, c2: 7200 },
      },
    ]);
    const { container } = render(<ActivityStrip />, { wrapper });

    await waitFor(() => expect(cells(container).length).toBe(84));
    const worked = cells(container).filter((c) => c.getAttribute('style'));

    /* c2 has two thirds of the day, so the cell is Byrne's green — not a
       blend, which would read as a colour no client owns. */
    expect(worked).toHaveLength(1);
    expect(worked[0]!.getAttribute('style')).toContain('66, 181, 154');
  });

  it('still marks a day of internal work as worked', async () => {
    serve([{ date: '2026-09-11', totalSeconds: 3600, byClient: { '': 3600 } }]);
    const { container } = render(<ActivityStrip />, { wrapper });

    await waitFor(() => expect(cells(container).length).toBe(84));
    const worked = cells(container).filter((c) => c.getAttribute('style'));

    /* A day spent on unbilled work is not an empty day. It has no client and
       therefore no hue, but it must not read as rest. */
    expect(worked).toHaveLength(1);
    expect(worked[0]!.getAttribute('style')).toContain('opacity');
  });

  it('names the date and the hours on every cell', async () => {
    serve([{ date: '2026-09-11', totalSeconds: 5400, byClient: { c1: 5400 } }]);
    const { container } = render(<ActivityStrip />, { wrapper });

    await waitFor(() => expect(cells(container).length).toBe(84));
    const titles = cells(container).map((c) => c.getAttribute('title') ?? '');

    expect(
      titles.some((t) => t.includes('2026-09-11') && t.includes('1h 30m')),
    ).toBe(true);
    // An empty day says so rather than showing a bare date.
    expect(titles.some((t) => t.includes('nothing tracked'))).toBe(true);
  });
});
