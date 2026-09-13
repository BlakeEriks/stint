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

/* Two projects under ONE client, plus a second client. The legend groups by
   client, so `p-north-a` and `p-north-b` must produce a single entry — colour
   identifies a client, and two identical swatches would be a bug. */
const CLIENT_PROJECTS = [
  { id: 'p-north-a', clientId: 'c-north', name: 'Warehouse' },
  { id: 'p-north-b', clientId: 'c-north', name: 'Peak season' },
  { id: 'p-byrne', clientId: 'c-byrne', name: 'Typography' },
  { id: 'p-internal', clientId: null, name: 'Internal' },
  /* Belongs to a client with a colour, and has NO time this week. This is the
     case that separates "built from the week" from "built from the project
     list" — a client with no projects at all would be excluded by either. */
  { id: 'p-absent', clientId: 'c-absent', name: 'Dormant' },
].map((p) => ({
  ...p,
  hourlyRate: null,
  isBillableDefault: true,
  archivedAt: null,
}));

const CLIENTS = [
  { id: 'c-north', name: 'Northwind Trading', color: '#6EA1E2' },
  { id: 'c-byrne', name: 'Byrne Studio', color: '#42B59A' },
  /* Has no time this week. A legend built from the CLIENT LIST would name it
     anyway, which is the opposite of a key. */
  { id: 'c-absent', name: 'Absent Co', color: '#DA8188' },
].map((c) => ({ ...c, archivedAt: null, hourlyRate: null }));

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

/** Serves the calendar, project and client endpoints the view reads. */
function serve(
  days: CalendarDay[],
  opts: { projects?: unknown[]; clients?: unknown[] } = {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes('/projects')
        ? { projects: opts.projects ?? PROJECTS }
        : u.includes('/clients')
          ? { clients: opts.clients ?? [] }
          : { days };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

/**
 * Make `useMediaQuery` report the narrow viewport.
 *
 * The calendar shows one day below `sm`, and that is a JS decision rather than
 * a CSS one because the arrows change what they STEP — a day instead of a
 * week — which no stylesheet can express. jsdom has no real viewport, so the
 * query has to be answered here.
 */
function matchMediaMock(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
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
      await screen.findByText(/Nothing logged this week/),
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

/**
 * The key to the colours on the grid.
 *
 * A block's left border is its client's colour, which only answers "whose work
 * is this?" once you know which hue is whose.
 */
describe('the calendar legend', () => {
  const week = (): CalendarDay[] => [
    {
      date: '2026-09-07',
      totalSeconds: 10800,
      entries: [
        entry({ id: 'a', projectId: 'p-north-a', durationSeconds: 3600 }),
        entry({ id: 'b', projectId: 'p-north-b', durationSeconds: 3600 }),
        entry({ id: 'c', projectId: 'p-byrne', durationSeconds: 3600 }),
      ],
    },
  ];

  const legendFor = (name: string) =>
    screen.getByText(name, { selector: 'span' });

  it('names one entry per CLIENT, not per project', async () => {
    serve(week(), { projects: CLIENT_PROJECTS, clients: CLIENTS });
    render(<Calendar />, { wrapper });

    /* Two projects under Northwind, one entry — colour identifies a client, so
       a row per project would repeat the same swatch twice and imply the hues
       are different. */
    expect(await screen.findAllByText('Northwind Trading')).toHaveLength(1);
    expect(legendFor('Byrne Studio')).toBeInTheDocument();
  });

  it('describes the week in view, not the whole client list', async () => {
    serve(week(), { projects: CLIENT_PROJECTS, clients: CLIENTS });
    render(<Calendar />, { wrapper });

    await screen.findAllByText('Northwind Trading');
    /* `Absent Co` exists and has a colour, but no time this week. Naming it
       would make the legend a client directory rather than a key to what is
       actually on screen. */
    expect(screen.queryByText('Absent Co')).toBeNull();
  });

  it('ranks by time tracked, so the week is read biggest-first', async () => {
    serve(
      [
        {
          date: '2026-09-07',
          totalSeconds: 18000,
          entries: [
            entry({ id: 'a', projectId: 'p-byrne', durationSeconds: 3600 }),
            entry({ id: 'b', projectId: 'p-north-a', durationSeconds: 14400 }),
          ],
        },
      ],
      { projects: CLIENT_PROJECTS, clients: CLIENTS },
    );
    render(<Calendar />, { wrapper });

    await screen.findAllByText('Northwind Trading');
    const labels = [...document.querySelectorAll('span.type-support')].map(
      (el) => el.textContent,
    );
    /* Northwind has 4h against Byrne's 1h, so it leads regardless of the order
       the entries happened to arrive in. */
    expect(labels.indexOf('Northwind Trading')).toBeLessThan(
      labels.indexOf('Byrne Studio'),
    );
  });

  it('names internal work only when some is present, and gives it no colour', async () => {
    serve(
      [
        {
          date: '2026-09-07',
          totalSeconds: 3600,
          entries: [
            entry({ id: 'a', projectId: 'p-internal', durationSeconds: 3600 }),
          ],
        },
      ],
      { projects: CLIENT_PROJECTS, clients: CLIENTS },
    );
    render(<Calendar />, { wrapper });

    /* Internal work has no client and so no stripe on the grid. Its swatch is
       an outline, describing the ABSENCE of colour — a shared grey would read
       as a client of its own, which `use-project-colors.ts` refuses for the
       same reason. */
    const item = await screen.findByText('No client', { selector: 'span' });
    const swatch = item.querySelector('span[aria-hidden]') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('');
  });

  it('renders no strip at all when the week is empty', async () => {
    serve([], { projects: CLIENT_PROJECTS, clients: CLIENTS });
    const { container } = render(<Calendar />, { wrapper });

    await screen.findByText(/Nothing logged this week/);

    /* Asserting the CONTAINER, not the absence of labels. With no entries
       there are no labels either way, so a label check passes whether or not
       the strip renders — it was written that way first and a mutation walked
       straight through it. What actually differs is the bordered bar, which
       would otherwise sit empty under an empty grid. */
    expect(container.querySelector('.flex-wrap.border-t')).toBeNull();
  });
});

/**
 * One day at a time on a phone.
 *
 * At 375px a week gives each day 42px: a block is one letter wide, an
 * overlapping one is 20px, and the drag target is below the ~44px a finger
 * needs. A block you cannot read is a block you cannot check, which is the
 * same principle the laning rule protects. A single day gets ~295px.
 */
describe('the calendar on a narrow viewport', () => {
  const week = (): CalendarDay[] => [
    {
      date: '2026-09-07',
      totalSeconds: 7200,
      entries: [entry({ id: 'mon', taskName: 'Monday work' })],
    },
    {
      date: '2026-09-09',
      totalSeconds: 3600,
      entries: [
        entry({
          id: 'wed',
          taskName: 'Wednesday work',
          startedAt: '2026-09-09T09:00:00.000Z',
          endedAt: '2026-09-09T10:00:00.000Z',
          durationSeconds: 3600,
        }),
      ],
    },
  ];

  it('shows only the selected day, not the whole week', async () => {
    matchMediaMock(true);
    serve(week());
    render(<Calendar />, { wrapper });

    /* Today is Wednesday the 9th in these tests, so that day's entry shows
       and Monday's does not — the grid is one column, not seven. */
    expect(await screen.findByText('Wednesday work')).toBeInTheDocument();
    expect(screen.queryByText('Monday work')).toBeNull();
  });

  it('names the day in the heading rather than the month', async () => {
    matchMediaMock(true);
    serve(week());
    render(<Calendar />, { wrapper });

    /* "Wed, Sep 9" answers "which day am I looking at?" outright; a month
       would be vague where the view is precise. */
    expect(await screen.findByText(/Wed, Sep 9/)).toBeInTheDocument();
    expect(screen.queryByText('September 2026')).toBeNull();
  });

  it('steps ONE DAY with the arrows, not one week', async () => {
    matchMediaMock(true);
    serve(week());
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByText(/Wed, Sep 9/);
    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    /* The 8th, not the 2nd. This is the whole reason the breakpoint is a JS
       decision: the arrows step whatever unit is on screen. */
    expect(await screen.findByText(/Tue, Sep 8/)).toBeInTheDocument();
  });

  it('totals the day on screen, not the week around it', async () => {
    matchMediaMock(true);
    serve(week());
    render(<Calendar />, { wrapper });

    /* Wednesday is 1h of the week's 3h. Showing the week's total over a
       single day's grid would misreport what is being looked at. */
    expect(await screen.findByText('1:00:00')).toBeInTheDocument();
    expect(screen.queryByText('3:00:00')).toBeNull();
  });

  it('says the DAY is empty, not the week', async () => {
    matchMediaMock(true);
    /* Monday has hours; Wednesday — the day on screen — does not. */
    serve([
      {
        date: '2026-09-07',
        totalSeconds: 7200,
        entries: [entry({ id: 'mon' })],
      },
    ]);
    render(<Calendar />, { wrapper });

    expect(
      await screen.findByText(/Nothing logged this day/),
    ).toBeInTheDocument();
  });

  it('still steps one week when the viewport is wide', async () => {
    matchMediaMock(false);
    serve(week());
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Calendar />, { wrapper });

    await screen.findByText('September 2026');
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(await screen.findByText('August 2026')).toBeInTheDocument();
  });
});

/**
 * The phone shows the hours that were worked, and the PAGE does the scrolling.
 *
 * Two scrollers competing for one viewport is what produced the double scroll:
 * the grid took 62vh — a fraction of the viewport, which knows nothing about
 * the chrome above it or the inbox below — and still hid content inside itself
 * while the page had more to go. Cropping is what keeps the single page scroll
 * honest; an uncropped 24h column would just move the excess into the page.
 */
describe('the mobile day grid crops to the hours in use', () => {
  const dayWith = (entries: TimeEntry[]): CalendarDay[] => [
    {
      date: '2026-09-09',
      totalSeconds: entries.reduce((s, e) => s + (e.durationSeconds ?? 0), 0),
      entries,
    },
  ];

  /** The hour labels down the gutter, in order. */
  const hourLabels = () =>
    [...document.querySelectorAll('.type-meta.leading-none')].map(
      (e) => e.textContent,
    );

  it('omits the empty night before the first entry', async () => {
    matchMediaMock(true);
    /* Work from 09:00. Rendering from midnight would put a quarter of the
       grid above the first block — scroll spent on nothing. */
    serve(
      dayWith([
        entry({
          id: 'a',
          startedAt: '2026-09-09T09:00:00.000Z',
          endedAt: '2026-09-09T11:00:00.000Z',
          durationSeconds: 7200,
        }),
      ]),
    );
    render(<Calendar />, { wrapper });

    await screen.findByText(/Wed, Sep 9/);
    expect(hourLabels()).not.toContain('00');
    expect(hourLabels()).not.toContain('03');
  });

  it('pads an hour either side, so a block is never flush against the edge', async () => {
    matchMediaMock(true);
    /* A 2h block in a 10h minimum window sits 1h in: its top should be about
       1/10 of the column. Asserting an UPPER bound as well as a lower one is
       what makes this about the padding — `top > 0` alone passes on an
       uncropped day too, where 09:00 is simply 37.5% down a full 24h. */
    serve(
      dayWith([
        entry({
          id: 'a',
          startedAt: '2026-09-09T09:00:00.000Z',
          endedAt: '2026-09-09T11:00:00.000Z',
          durationSeconds: 7200,
        }),
      ]),
    );
    render(<Calendar />, { wrapper });

    await screen.findByText(/Wed, Sep 9/);
    const box = screen
      .getByText('Work')
      .closest('[style*="top"]') as HTMLElement;
    const top = parseFloat(box.style.top);

    /* Without the margin there is nowhere to drag the block earlier, so the
       padding is part of the gesture working rather than decoration. */
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(20);
  });

  it('shows an ordinary working day when nothing was tracked', async () => {
    matchMediaMock(true);
    serve([]);
    render(<Calendar />, { wrapper });

    await screen.findByText(/Nothing logged this day/);
    /* 07:00-19:00: a day with no entries has no worked range to crop to, and
       a blank midnight-to-midnight would be the longest possible page for the
       least possible information. */
    expect(hourLabels()).not.toContain('00');
    expect(hourLabels()).toContain('09');
  });

  it('keeps all 24 hours in the week view', async () => {
    matchMediaMock(false);
    serve(
      dayWith([
        entry({
          id: 'a',
          startedAt: '2026-09-09T09:00:00.000Z',
          endedAt: '2026-09-09T11:00:00.000Z',
          durationSeconds: 7200,
        }),
      ]),
    );
    render(<Calendar />, { wrapper });

    await screen.findByText('September 2026');
    /* Seven columns share one window, so cropping would crop them all to the
       busiest day's range — and the week's columns are short enough to read
       whole anyway. */
    expect(hourLabels()).toContain('00');
    expect(hourLabels()).toContain('21');
  });
});
