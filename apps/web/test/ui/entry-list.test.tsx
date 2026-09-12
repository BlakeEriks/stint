import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EntryList } from '@/components/entry-list';
import type { Project, TimeEntry } from '@/lib/client/api';

const PROJECTS = [
  { id: 'p1', name: 'Acme Redesign', color: '#DA8188' },
] as unknown as Project[];

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
});
