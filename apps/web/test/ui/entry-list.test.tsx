import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EntryList } from '@/components/entry-list';
import type { Project, TimeEntry } from '@/lib/client/api';

const PROJECTS = [{ id: 'p1', name: 'Acme Redesign' }] as unknown as Project[];

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Writing',
    projectId: null,
    startedAt: '2026-09-11T09:00:00.000Z',
    endedAt: '2026-09-11T10:00:00.000Z',
    isBillable: true,
    durationSeconds: 3600,
    ...over,
  } as TimeEntry;
}

function serve(entries: TimeEntry[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ entries }), { status: 200 }),
    ),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderList = (todaySeconds = 3600) =>
  render(<EntryList projects={PROJECTS} todaySeconds={todaySeconds} />, {
    wrapper,
  });

/**
 * The start–end span. Matched by its en dash rather than by the clock, which
 * is formatted in whoever's zone is running the test.
 */
const timeRange = () =>
  screen.getByText(
    (_, el) =>
      el?.tagName === 'SPAN' &&
      el.children.length === 0 &&
      el.textContent?.includes(' – ') === true,
  );

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EntryList', () => {
  it('lists completed entries with their duration', async () => {
    serve([entry({ taskName: 'Invoicing', durationSeconds: 5400 })]);
    renderList();

    expect(await screen.findByText('Invoicing')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
  });

  /**
   * The running entry belongs to the timer bar. Listing it here too would
   * show the same work twice.
   */
  it('omits the running entry, which the timer bar already shows', async () => {
    serve([
      entry({ id: 'done', taskName: 'Finished task' }),
      entry({
        id: 'live',
        taskName: 'Still running',
        endedAt: null,
        durationSeconds: null,
      }),
    ]);
    renderList();

    expect(await screen.findByText('Finished task')).toBeInTheDocument();
    expect(screen.queryByText('Still running')).not.toBeInTheDocument();
  });

  it("shows today's total in the header", async () => {
    serve([entry()]);
    renderList(7200);

    expect(await screen.findByText('2:00:00')).toBeInTheDocument();
  });

  it('names an untitled entry rather than rendering a blank row', async () => {
    serve([entry({ taskName: '' })]);
    renderList();

    expect(await screen.findByText('Untitled')).toBeInTheDocument();
  });

  it('marks a non-billable entry', async () => {
    serve([entry({ isBillable: false })]);
    renderList();

    expect(await screen.findByText('Non-billable')).toBeInTheDocument();
  });

  it('leaves a billable entry unmarked', async () => {
    serve([entry({ isBillable: true })]);
    renderList();

    await screen.findByText('Writing');
    expect(screen.queryByText('Non-billable')).not.toBeInTheDocument();
  });

  it('shows the project name when one is assigned', async () => {
    serve([entry({ projectId: 'p1' })]);
    renderList();

    expect(await screen.findByText('Acme Redesign')).toBeInTheDocument();
  });

  it('prompts to start a timer when nothing is logged', async () => {
    serve([]);
    renderList(0);

    expect(
      await screen.findByText(/Nothing logged yet today/),
    ).toBeInTheDocument();
  });

  /**
   * The list renders in a 372px dock, where a `sm:` VIEWPORT breakpoint is
   * true on a 1440px window and lays the row out as though there were room.
   *
   * Asserting the fields are present would pass against the viewport code
   * too — jsdom builds `hidden sm:flex` into the DOM either way, and applies
   * no media queries. So this reads the mechanism: the row must OPT IN to
   * container queries, and neither field may carry `hidden` or a `sm:` class.
   */
  it('sizes the row by its container, never the viewport', async () => {
    serve([entry({ projectId: 'p1' })]);
    renderList();

    const row = await screen.findByRole('button', { name: /Edit Writing/ });
    expect(row.className).toContain('@container');

    const project = screen.getByText('Acme Redesign');
    const range = timeRange();

    for (const field of [project, range]) {
      expect(field.className).not.toMatch(/(^|\s)hidden(\s|$)/);
      expect(field.className).not.toMatch(/(^|\s)sm:/);
      expect(field.className).toMatch(/@md:/);
    }
  });

  /**
   * The name is the subject of the row. Sharing the first line with the
   * badge, the range and the duration left it 15px of a 372px dock — a task
   * truncated to one character, which is not a name.
   */
  it('gives the task name the whole first line while the row is narrow', async () => {
    serve([entry({ projectId: 'p1' })]);
    renderList();

    const row = await screen.findByRole('button', { name: /Edit Writing/ });
    const name = within(row).getByText('Writing');

    expect(name.className).toContain('basis-full');
    expect(name.className).toMatch(/@md:basis-auto/);
  });

  /**
   * Hiding a billing-relevant field is worse than wrapping it. The second
   * line is what `order` buys, and `flex-wrap` is what lets it exist.
   */
  it('wraps the project and the time range rather than hiding them', async () => {
    serve([entry({ projectId: 'p1' })]);
    renderList();

    const row = await screen.findByRole('button', { name: /Edit Writing/ });
    expect(row.className).toContain('flex-wrap');

    expect(screen.getByText('Acme Redesign').className).toMatch(/order-\d/);
    expect(timeRange().className).toMatch(/order-\d/);
  });

  /**
   * The dock carries no surface, and Today is subordinate to the inbox above
   * it: a hairline, and no panel of its own.
   */
  it('renders without a panel of its own', async () => {
    serve([entry()]);
    const { container } = renderList();

    await screen.findByText('Writing');
    expect(container.querySelector('.bg-surface-elevated')).toBeNull();
    expect(container.querySelector('.shadow-card')).toBeNull();
  });
});
