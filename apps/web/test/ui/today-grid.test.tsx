import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/entries'))
        return new Response(JSON.stringify({ entries }), { status: 200 });
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const draw = () =>
  render(<EntryList grid compact projects={[]} todaySeconds={6300} />, {
    wrapper,
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Today as a day column', () => {
  it('opens the editor from a block', async () => {
    serve([entry()]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    draw();

    const block = await screen.findByRole('button', {
      name: /Edit API integration/,
    });
    await user.click(block);

    expect(await screen.findByText('Edit entry')).toBeInTheDocument();
  });

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
      name: /Edit API integration, \d{1,2}:\d{2} [AP]M–\d{1,2}:\d{2} [AP]M$/,
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
  });

  it('keeps the running entry out of the list view', async () => {
    serve([
      entry(),
      entry({ id: 'e2', taskName: 'Schema review', endedAt: null }),
    ]);
    render(<EntryList compact projects={[]} todaySeconds={6300} />, {
      wrapper,
    });

    /* The list is durations, and the timer bar is already counting this one
       up — the same fact twice. Only the grid wants it. */
    expect(await screen.findByText('API integration')).toBeInTheDocument();
    expect(screen.queryByText('Schema review')).not.toBeInTheDocument();
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

  it('scrolls Today rather than the dock', async () => {
    serve([entry()]);
    const { container } = draw();
    await screen.findByRole('button', { name: /Edit API integration/ });

    /* The scroll lives on a box INSIDE Today, not on the section or anything
       above it. The inbox holds its place and the grid gives way, so a full
       inbox squeezes the calendar — which is the pressure that gets the
       inbox cleared, and the reason clearing it is rewarded. */
    const section = container.querySelector(
      'section[aria-label="Today\'s entries"]',
    );
    expect(section?.className).not.toMatch(/overflow-y-auto/);
    expect(section?.querySelector('.overflow-y-auto')).not.toBeNull();
  });

  it('is the only accent on the column', async () => {
    serve([entry()]);
    const { container } = draw();
    await screen.findByRole('button', { name: /Edit API integration/ });

    /* The accent marks the live thing, once. With nothing running, the
       now-line is the only thing wearing it. */
    expect(container.querySelectorAll('.border-accent-default')).toHaveLength(
      1,
    );
  });
});
