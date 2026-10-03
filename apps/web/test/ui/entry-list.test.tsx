import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EntryList } from '@/components/entry-list';
import type { Project, TimeEntry } from '@/lib/client/api';
import { INTERNAL_SWATCH } from '@/lib/client/use-project-colors';

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

  it('marks a non-billable entry', async () => {
    serve([entry({ isBillable: false })]);
    renderList();

    expect(await screen.findByText('Non-billable')).toBeInTheDocument();
  });

  /**
   * Internal work has no CLIENT and therefore no color, but it keeps a
   * swatch: the gray is what a swatch draws when there is no color to draw,
   * so internal hours stay legible in a row or a graph beside the clients.
   *
   * It must be the SEMANTIC token. `--text-subtle` is a primitive that the
   * token package owns and `tokens.css` is free to rename; `--color-subtle`
   * is what it emits for components to reach for.
   */
  it('draws internal work with the semantic neutral, not a primitive', async () => {
    serve([entry({ projectId: 'p1' })]);
    renderList();

    const row = await screen.findByRole('button', { name: /Edit Writing/ });
    const swatch = row.querySelector<HTMLElement>('[aria-hidden]');

    expect(swatch).not.toBeNull();
    expect(swatch?.getAttribute('style')).toContain(INTERNAL_SWATCH);
    expect(INTERNAL_SWATCH).toBe('var(--color-subtle)');
    expect(swatch?.getAttribute('style')).not.toContain('--text-subtle');
  });
});
