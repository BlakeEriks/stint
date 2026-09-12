import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Calendar } from '@/components/calendar';
import type { CalendarDay, TimeEntry } from '@/lib/client/api';

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

function entry(over: Partial<TimeEntry>): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Work',
    projectId: null,
    startedAt: '2026-09-07T09:00:00.000Z',
    endedAt: '2026-09-07T11:00:00.000Z',
    isBillable: true,
    durationSeconds: 7200,
    ...over,
  } as TimeEntry;
}

/** Serves the calendar and project endpoints the view reads. */
function serve(days: CalendarDay[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/projects')
        ? { projects: PROJECTS }
        : { days };
      return new Response(JSON.stringify(body), { status: 200 });
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
  // A Wednesday, so the week has days on both sides of "today".
  vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Calendar', () => {
  it('renders a seven-day week with every weekday heading', async () => {
    serve([]);
    render(<Calendar />, { wrapper });

    await screen.findByText('Mon');
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
  });

  it('says so when the week is empty rather than showing a blank grid', async () => {
    serve([]);
    render(<Calendar />, { wrapper });

    expect(
      await screen.findByText('Nothing logged this week.'),
    ).toBeInTheDocument();
  });

  it('totals the week across days', async () => {
    serve([
      { date: '2026-09-07', totalSeconds: 7200, entries: [entry({})] },
      {
        date: '2026-09-08',
        totalSeconds: 3600,
        entries: [entry({ id: 'e2' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    // 3h, formatted as a clock.
    expect(await screen.findByText('3:00:00')).toBeInTheDocument();
  });

  it('labels an entry with its task name', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ taskName: 'Design review' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    expect(await screen.findByText('Design review')).toBeInTheDocument();
  });

  it('names an untitled entry rather than rendering an empty block', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ taskName: '' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    expect(await screen.findByText('Untitled')).toBeInTheDocument();
  });

  /**
   * Overlapping entries must sit side by side. Stacking them would hide one
   * completely, and in a billing tool a block you cannot see is a block you
   * cannot check.
   */
  it('gives overlapping entries their own lanes so neither is hidden', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 10_800,
        entries: [
          entry({
            id: 'a',
            taskName: 'First',
            startedAt: '2026-09-07T09:00:00.000Z',
            endedAt: '2026-09-07T11:00:00.000Z',
          }),
          entry({
            id: 'b',
            taskName: 'Second',
            startedAt: '2026-09-07T10:00:00.000Z',
            endedAt: '2026-09-07T12:00:00.000Z',
          }),
        ],
      },
    ]);
    render(<Calendar />, { wrapper });

    const first = await screen.findByText('First');
    const second = screen.getByText('Second');
    const boxOf = (el: HTMLElement) => el.closest('[style]') as HTMLElement;

    // Half width each, at different offsets — not stacked on top of each other.
    expect(boxOf(first).style.width).toBe('50%');
    expect(boxOf(second).style.width).toBe('50%');
    expect(boxOf(first).style.left).not.toBe(boxOf(second).style.left);
  });

  it('keeps a single entry full width', async () => {
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ taskName: 'Alone' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    const box = (await screen.findByText('Alone')).closest(
      '[style]',
    ) as HTMLElement;
    expect(box.style.width).toBe('100%');
    expect(box.style.left).toBe('0%');
  });

  it('moves to the previous week and back', async () => {
    serve([]);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByText('September 2026');
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText('August 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'This week' }));
    expect(await screen.findByText('September 2026')).toBeInTheDocument();
  });
});
