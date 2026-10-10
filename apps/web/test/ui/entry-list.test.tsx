import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EntryList', () => {
  it('shows what the day earned beside the title', async () => {
    serve([entry()]);
    render(
      <EntryList projects={PROJECTS} todaySeconds={7200} earnedToday={262.5} />,
      { wrapper },
    );

    expect(await screen.findByText('$262.50')).toBeInTheDocument();
  });

  it('says nothing about money where there is no figure to say', async () => {
    serve([entry()]);
    renderList(7200);

    /* `$0.00` over a figure that is merely not loaded reports a day that
       earned nothing and then takes it back a moment later. */
    await screen.findByText('2h');
    expect(screen.queryByText(/^\$/)).toBeNull();
  });
});
