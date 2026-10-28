import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EntryList } from '@/components/entry-list';

/**
 * Today drawn as a day column rather than a list.
 *
 * jsdom has no layout, so the geometry assertions read the inline `top` and
 * `height` percentages rather than pixels — the same seam
 * `calendar-edit.test.tsx` uses. What is tested here is which entries are
 * drawn, which of them are clickable, and that the now-line exists and sits
 * where the clock says.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/** Noon UTC on a day with no DST transition, so local and UTC agree here. */
const NOW = new Date('2026-09-11T12:00:00.000Z');

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  taskName: 'API integration',
  projectId: null,
  startedAt: '2026-09-11T09:00:00.000Z',
  endedAt: '2026-09-11T10:45:00.000Z',
  isBillable: true,
  durationSeconds: 6300,
  ...over,
});

type Entry = {
  id: string;
  taskName: string;
  projectId: string | null;
  startedAt: string;
  endedAt: string | null;
  isBillable: boolean;
  durationSeconds: number | null;
  invoiceId?: string | null;
};

function serve(entries: Entry[]) {
  const writes: { method: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') !== 'GET') {
        writes.push({ method: init?.method ?? 'GET', url });
        return new Response(JSON.stringify({ entry: entries[0] }), {
          status: 200,
        });
      }
      if (url.includes('/entries'))
        return new Response(JSON.stringify({ entries }), { status: 200 });
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }),
  );
  return { writes };
}

/** jsdom lays nothing out: give the column a height to resolve pixels in. */
function layOut() {
  const column = document.querySelector<HTMLElement>('.border-l')!;
  column.getBoundingClientRect = () =>
    ({ top: 0, left: 0, height: 720, width: 100 }) as DOMRect;
  return column;
}

const columnHeight = () =>
  Number.parseFloat(
    document.querySelector<HTMLElement>('.border-l')!.style.height,
  );

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const draw = () =>
  render(<EntryList projects={[]} todaySeconds={6300} />, { wrapper });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Today as a day column', () => {
  it('carries the times in the accessible name', async () => {
    serve([entry()]);
    draw();

    /* The visible text is a truncated name and a duration, so without the
       range in the label two blocks are indistinguishable to a screen
       reader.

       The times are asserted as a SHAPE, not a wall clock: the suite runs in
       whatever zone the machine is in, and a hard-coded "9:00 AM" passes in
       UTC and fails in São Paulo. What matters is that both ends are
       there. */
    const block = await screen.findByRole('button', {
      name: /^Edit API integration .*\d{1,2}:\d{2} [AP]M–\d{1,2}:\d{2} [AP]M$/,
    });
    expect(block).toBeInTheDocument();
  });

  it('draws the running entry but does not make it clickable', async () => {
    serve([
      entry(),
      entry({
        id: 'e2',
        taskName: 'Schema review',
        startedAt: '2026-09-11T11:30:00.000Z',
        endedAt: null,
        durationSeconds: null,
      }),
    ]);
    draw();

    /* It is drawn: a column missing the running entry has a hole at the one
       place the eye goes. Its name and times are screen-reader text rather
       than a label, since the block is not an interactive element. */
    expect(await screen.findByText(/Schema review, /)).toBeInTheDocument();

    /* It is not a button: `EntryDialog` refuses a running entry — its end
       does not exist yet — so a click would open a dialog that declines to
       edit what was clicked. The timer bar owns it mid-run. */
    expect(
      screen.queryByRole('button', { name: /Schema review/ }),
    ).not.toBeInTheDocument();

    /* It wears the timer's green, not the button's: in light they are a
       rung apart, and the live timer reads as one color. */
    const block = screen
      .getByText(/Schema review, /)
      .closest('[class*="border-"]');
    expect(block?.className).toContain('border-timer-running');
    expect(block?.className).not.toContain('accent-default');
  });

  it('puts the now-line where the clock is', async () => {
    serve([entry()]);
    const { container } = draw();
    const block = await screen.findByRole('button', {
      name: /Edit API integration/,
    });

    /* Against the BLOCK rather than an absolute percentage: the window is
       derived from the entry's local hours, so a fixed number is only right
       in the zone it was written in — 40% in UTC is 70% in Tokyo, where the
       same instants are an evening and the window clamps at midnight.

       What holds in every zone is the ordering: this entry ended before now,
       so the line sits below the block's bottom edge. */
    const line = container.querySelector('.border-accent-default');
    expect(line).not.toBeNull();

    const at = (el: Element, prop: 'top' | 'height') =>
      Number.parseFloat((el as HTMLElement).style[prop]);

    expect(at(line as Element, 'top')).toBeGreaterThan(
      at(block, 'top') + at(block, 'height'),
    );
  });

  it('keeps the now-line inside the grid when the day stopped hours ago', async () => {
    /* The bug this exists for: `workedWindow` is derived from the ENTRIES, so
       a morning's work and an idle afternoon gave a window ending at 14:00
       with the line drawn for 17:00 — a fraction above 1, floating below the
       grid it belongs to. */
    vi.setSystemTime(new Date('2026-09-11T17:00:00.000Z'));
    serve([
      entry({
        startedAt: '2026-09-11T08:00:00.000Z',
        endedAt: '2026-09-11T13:00:00.000Z',
      }),
    ]);
    const { container } = draw();
    await screen.findByRole('button', { name: /Edit API integration/ });

    const line = container.querySelector('.border-accent-default');
    expect(line).not.toBeNull();

    const top = Number.parseFloat((line as HTMLElement).style.top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(100);
  });
});

describe("Today takes the calendar's gestures", () => {
  it('drags a block to new times', async () => {
    const srv = serve([entry()]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    draw();

    const target = await screen.findByRole('button', {
      name: /Edit API integration/,
    });
    layOut();
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      { target, coords: { x: 10, y: 360 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    await waitFor(() => expect(srv.writes).toHaveLength(1));
    expect(srv.writes[0]).toMatchObject({ method: 'PATCH' });
    expect(srv.writes[0]!.url).toContain('/entries/e1');
  });

  it('opens a new entry where empty grid is clicked, writing nothing', async () => {
    const srv = serve([entry()]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    draw();

    await screen.findByRole('button', { name: /Edit API integration/ });
    const column = layOut();
    await user.pointer({
      target: column,
      coords: { x: 10, y: 700 },
      keys: '[MouseLeft]',
    });

    expect(
      await screen.findByRole('heading', { name: 'Add entry' }),
    ).toBeInTheDocument();
    expect(srv.writes).toEqual([]);
  });
});

describe('zooming a day column', () => {
  it('scales the hour on a pinch or a modified scroll, and keeps it', async () => {
    serve([entry()]);
    const { unmount } = draw();
    await screen.findByRole('button', { name: /Edit API integration/ });
    const column = document.querySelector<HTMLElement>('.border-l')!;
    const before = columnHeight();

    // A plain scroll is a scroll: the page zoom it would be is not taken.
    expect(fireEvent.wheel(column, { deltaY: -50 })).toBe(true);
    expect(columnHeight()).toBe(before);

    // A pinch arrives with ctrlKey set; the browser's page zoom is refused.
    expect(fireEvent.wheel(column, { deltaY: -50, ctrlKey: true })).toBe(false);
    const zoomed = columnHeight();
    expect(zoomed).toBeGreaterThan(before);

    fireEvent.wheel(column, { deltaY: 50, metaKey: true });
    expect(columnHeight()).toBeLessThan(zoomed);
    fireEvent.wheel(column, { deltaY: -50, metaKey: true });

    // The level outlives the screen that set it, in this browser.
    expect(
      Number(localStorage.getItem('stint.calendar.pxPerHour')),
    ).toBeCloseTo((zoomed / before) * 44);
    unmount();
    draw();
    await screen.findByRole('button', { name: /Edit API integration/ });
    expect(columnHeight()).toBeCloseTo(zoomed);
  });
});
