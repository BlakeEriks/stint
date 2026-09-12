import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Calendar } from '@/components/calendar';
import type { CalendarDay, TimeEntry } from '@/lib/client/api';

/**
 * Correcting time from the calendar.
 *
 * The pixel→instant maths is covered against real 23- and 25-hour DST columns
 * in `@stint/core`'s grid tests, where it can be asserted exactly. jsdom has no
 * layout, so what is worth pinning HERE is the wiring: which gestures a block
 * offers, and — above all — that the click which ends a drag does not also
 * commit one. Every assertion below was verified to fail when its rule is
 * removed.
 */

const PROJECTS = [
  {
    id: 'p1',
    clientId: null,
    name: 'Acme',
    hourlyRate: null,
    isBillableDefault: true,
    archivedAt: null,
  },
];

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Work',
    projectId: null,
    startedAt: '2026-09-07T09:00:00.000Z',
    endedAt: '2026-09-07T11:00:00.000Z',
    isBillable: true,
    durationSeconds: 7200,
    invoiceId: null,
    ...over,
  } as TimeEntry;
}

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** Serves the view's reads and records every write. */
function serve(days: CalendarDay[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const body = String(url).includes('/projects')
        ? { projects: PROJECTS }
        : { days };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return {
    writes: () => calls.filter((c) => c.method !== 'GET'),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Give the day column a real height, since jsdom lays nothing out.
 *
 * 720px over 24 hours makes the arithmetic legible: 30px is an hour.
 */
function layOut() {
  const columns = document.querySelectorAll<HTMLElement>('.border-l');
  for (const column of columns) {
    column.getBoundingClientRect = () =>
      ({ top: 0, left: 0, height: 720, width: 100 }) as DOMRect;
  }
}

const block = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('opening an entry from the calendar', () => {
  it('opens the editor on the entry that was clicked', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ taskName: 'Design review' })],
      },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await user.click(
      await screen.findByRole('button', { name: /Design review/ }),
    );

    expect(await screen.findByText('Edit entry')).toBeInTheDocument();
    expect(screen.getByLabelText('Task')).toHaveValue('Design review');
  });

  /* The block's visible text is a truncated name and a duration, so without
     the times in the accessible name two blocks are indistinguishable to a
     screen reader. */
  it('names a block with its time range, not just its task', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ taskName: 'Standup' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    const button = await screen.findByRole('button', { name: /Standup/ });
    expect(button).toHaveAccessibleName(/Standup, \d+:\d+\s?(AM|PM)/i);
  });

  it('marks a billed entry as billed in its accessible name', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ taskName: 'Billed work', invoiceId: 'inv-1' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    expect(
      await screen.findByRole('button', { name: /Billed work.*billed/i }),
    ).toBeInTheDocument();
  });
});

describe('creating an entry by clicking a time', () => {
  it('opens the editor pre-filled rather than writing a row', async () => {
    const srv = serve([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByText('Mon');
    layOut();

    // 270px down a 720px column is 09:00.
    const column = document.querySelectorAll<HTMLElement>('.border-l')[0]!;
    await user.pointer({
      target: column,
      coords: { x: 10, y: 270 },
      keys: '[MouseLeft]',
    });

    expect(
      await screen.findByRole('heading', { name: 'Add entry' }),
    ).toBeInTheDocument();
    // A click on a grid is too cheap a gesture to create a financial record.
    expect(srv.writes()).toEqual([]);
  });

  /* Clicking a time is a pointer-only gesture, so without this the whole
     create path is unreachable by keyboard. The heading's button is also the
     discoverable one: clicking empty grid is faster but invisible until tried. */
  it('offers a keyboard path to add an entry on each day', async () => {
    const srv = serve([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByText('Mon');
    const adders = screen.getAllByRole('button', { name: /^Add an entry on/ });
    expect(adders).toHaveLength(7);

    await user.click(adders[0]!);

    expect(
      await screen.findByRole('heading', { name: 'Add entry' }),
    ).toBeInTheDocument();
    expect(srv.writes()).toEqual([]);
  });

  it('seeds the clicked time into the form', async () => {
    serve([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByText('Mon');
    layOut();

    const column = document.querySelectorAll<HTMLElement>('.border-l')[0]!;
    await user.pointer({
      target: column,
      coords: { x: 10, y: 270 },
      keys: '[MouseLeft]',
    });

    await screen.findByRole('heading', { name: 'Add entry' });
    // Times render in the viewer's zone, so assert the shape and the one-hour
    // default rather than a wall clock the test environment decides.
    const start = (screen.getByLabelText('Start') as HTMLInputElement).value;
    const end = (screen.getByLabelText('End') as HTMLInputElement).value;
    expect(start).toMatch(/^\d\d:\d\d$/);
    expect(end).toMatch(/^\d\d:\d\d$/);
    expect(start).not.toBe(end);
  });
});

describe('adjusting an entry by dragging', () => {
  /**
   * The rule that matters most here. A block is both the drag handle and the
   * control that opens the editor, so without a travel threshold every click
   * would PATCH billable time by whatever a 1px tremor resolved to.
   */
  /* 3px is under DRAG_THRESHOLD_PX but, snapped, would still land a 15-minute
     change — so this isolates the threshold rather than relying on the snap
     swallowing the movement. Verified: with the threshold removed, this PATCHes. */
  it('does not write when the pointer never travelled', async () => {
    const srv = serve([
      { date: '2026-09-07', totalSeconds: 7200, entries: [entry()] },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByRole('button', { name: /Work/ });
    layOut();

    const target = block(/Work/);
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      // Three pixels: inside the threshold, so this is a click, not a drag.
      { target, coords: { x: 10, y: 303 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    expect(srv.writes()).toEqual([]);
  });

  it('patches the new times once the pointer has travelled', async () => {
    const srv = serve([
      { date: '2026-09-07', totalSeconds: 7200, entries: [entry()] },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByRole('button', { name: /Work/ });
    layOut();

    const target = block(/Work/);
    // 60px on a 720px day column is two hours.
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      { target, coords: { x: 10, y: 360 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    await waitFor(() => expect(srv.writes()).toHaveLength(1));
    const write = srv.writes()[0]!;
    expect(write.method).toBe('PATCH');
    expect(write.url).toContain('/entries/e1');

    const moved = write.body as { startedAt: string; endedAt: string };
    // Moved later, and still two hours long — a move is not a resize.
    expect(new Date(moved.startedAt).getTime()).toBeGreaterThan(
      new Date('2026-09-07T09:00:00.000Z').getTime(),
    );
    expect(
      new Date(moved.endedAt).getTime() - new Date(moved.startedAt).getTime(),
    ).toBe(7_200_000);
  });

  it('does not open the editor after a drag', async () => {
    serve([{ date: '2026-09-07', totalSeconds: 7200, entries: [entry()] }]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByRole('button', { name: /Work/ });
    layOut();

    const target = block(/Work/);
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      { target, coords: { x: 10, y: 360 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    // Interrupting every adjustment with a dialog would make dragging useless.
    expect(screen.queryByText('Edit entry')).not.toBeInTheDocument();
  });

  /**
   * A billed entry is frozen by a database trigger, so a drag would 409 after
   * the fact — and the block would spring back with no explanation. Refusing
   * the gesture is the honest version; the editor still opens and says why.
   */
  it('refuses to drag an entry billed on an issued invoice', async () => {
    const srv = serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ invoiceId: 'inv-1' })],
      },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByRole('button', { name: /Work/ });
    layOut();

    const target = block(/Work/);
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      { target, coords: { x: 10, y: 400 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    expect(srv.writes()).toEqual([]);
  });

  /* A running entry has no end to adjust, and the timer bar owns it. */
  it('refuses to drag a running entry', async () => {
    const srv = serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [
          entry({ taskName: 'Running', endedAt: null, durationSeconds: null }),
        ],
      },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByRole('button', { name: /Running/ });
    layOut();

    const target = block(/Running/);
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      { target, coords: { x: 10, y: 400 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    expect(srv.writes()).toEqual([]);
  });

  /* A rejected drag springs the block back to where the server says it is.
     Without a message that reads as the gesture not registering. */
  it('reports a rejected drag instead of silently reverting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') !== 'GET') {
          /* Flat `{ code, message }`, which is what `errorResponse` sends —
             nesting it under `error` would leave `message` undefined and the
             alert would render empty while the test still passed. */
          return new Response(
            JSON.stringify({
              code: 'ENTRY_LOCKED',
              message: 'This entry is billed on an issued invoice',
            }),
            { status: 409 },
          );
        }
        return new Response(
          JSON.stringify(
            String(url).includes('/projects')
              ? { projects: PROJECTS }
              : {
                  days: [
                    {
                      date: '2026-09-07',
                      totalSeconds: 7200,
                      entries: [entry()],
                    },
                  ],
                },
          ),
          { status: 200 },
        );
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByRole('button', { name: /Work/ });
    layOut();

    const target = block(/Work/);
    await user.pointer([
      { target, coords: { x: 10, y: 300 }, keys: '[MouseLeft>]' },
      { target, coords: { x: 10, y: 360 } },
      { target, keys: '[/MouseLeft]' },
    ]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/billed/i);
  });
});
