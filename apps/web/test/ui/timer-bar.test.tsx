import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TimerBar } from '@/components/timer-bar';
import type { Project, Summary, TimeEntry } from '@/lib/client/api';

const START = '2026-09-11T09:00:00.000Z';
const NOW = '2026-09-11T09:25:00.000Z';

const PROJECTS = [
  { id: 'p1', name: 'Acme Redesign', color: '#DA8188' },
  { id: 'p2', name: 'Bluebird API', color: '#42B59A' },
] as unknown as Project[];

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Writing',
    projectId: null,
    startedAt: START,
    endedAt: null,
    isBillable: true,
    durationSeconds: null,
    ...over,
  } as TimeEntry;
}

function summary(over: Partial<Summary> = {}): Summary {
  return {
    running: null,
    todaySeconds: 0,
    weekSeconds: 0,
    exceedsThreshold: false,
    maxTimerHours: 8,
    serverTime: NOW,
    ...over,
  };
}

/**
 * Records the writes the component issues, so assertions are about what the
 * server was asked to do — the part a user would feel — rather than about
 * internal state.
 */
function serve(data: Summary) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/v1', '');
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        calls.push({
          method,
          path,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify(entry()), { status: 200 });
      }
      return new Response(JSON.stringify(data), { status: 200 });
    }),
  );

  return calls;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderBar = () =>
  render(<TimerBar projects={PROJECTS} />, { wrapper });

const taskInput = () => screen.getByLabelText('Task name');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TimerBar — idle', () => {
  it('offers a start control and an empty task field', async () => {
    serve(summary());
    renderBar();

    await screen.findByRole('button', { name: 'Start timer' });
    expect(taskInput()).toHaveValue('');
  });

  it('starts with the typed task and chosen project', async () => {
    const calls = serve(summary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Start timer' });
    await user.type(taskInput(), 'Invoicing');
    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Acme/ }));
    await user.click(screen.getByRole('button', { name: 'Start timer' }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/timer/start',
        body: { taskName: 'Invoicing', projectId: 'p1' },
      }),
    );
  });

  it('starts on Enter from the task field', async () => {
    const calls = serve(summary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Start timer' });
    await user.type(taskInput(), 'Standup{Enter}');

    await waitFor(() =>
      expect(calls.map((c) => c.path)).toContain('/timer/start'),
    );
  });

  /** Picking a project while idle is local state, not a write. */
  it('does not patch anything when a project is picked while idle', async () => {
    const calls = serve(summary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Start timer' });
    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Bluebird/ }));

    expect(calls).toHaveLength(0);
  });
});

describe('TimerBar — running', () => {
  const runningSummary = () =>
    summary({ running: entry(), todaySeconds: 1500 });

  it("shows the server's task name and a stop control", async () => {
    serve(runningSummary());
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    expect(taskInput()).toHaveValue('Writing');
    // 25 minutes, counted from startedAt.
    expect(screen.getByText('0:25:00')).toBeInTheDocument();
  });

  it('stops on click', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await user.click(await screen.findByRole('button', { name: 'Stop timer' }));

    await waitFor(() =>
      expect(calls.map((c) => c.path)).toContain('/timer/stop'),
    );
  });

  it('patches the running entry when the task is renamed and blurred', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    await user.clear(taskInput());
    await user.type(taskInput(), 'Rewriting');
    await user.tab();

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/timer/current',
        body: { taskName: 'Rewriting' },
      }),
    );
  });

  /**
   * An unchanged name must not generate a pointless write.
   *
   * The edit has to actually happen and then be undone: merely focusing and
   * blurring leaves `editing` null, so `commitRename` returns before it ever
   * reaches the comparison this is meant to guard.
   */
  it('does not patch when the task name ends up unchanged', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    await user.type(taskInput(), '!');
    await user.keyboard('{Backspace}');
    await user.tab();

    expect(taskInput()).toHaveValue('Writing');
    expect(calls).toHaveLength(0);
  });

  it('reverts an in-progress rename on Escape', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    await user.clear(taskInput());
    await user.type(taskInput(), 'Scratch that{Escape}');

    expect(taskInput()).toHaveValue('Writing');
    expect(calls).toHaveLength(0);
  });

  it('patches the project immediately when reassigned mid-run', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    await user.click(screen.getByRole('button', { name: 'Project' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Acme/ }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/timer/current',
        body: { projectId: 'p1' },
      }),
    );
  });
});

describe('TimerBar — runaway', () => {
  it('surfaces a timer past the threshold without altering it', async () => {
    // 9h against an 8h threshold.
    vi.setSystemTime(new Date('2026-09-11T18:00:00.000Z'));
    const calls = serve(
      summary({
        running: entry(),
        serverTime: '2026-09-11T18:00:00.000Z',
        todaySeconds: 32_400,
        maxTimerHours: 8,
      }),
    );
    renderBar();

    expect(await screen.findByText(/has run for 9 hours/)).toBeInTheDocument();
    // Surfaced, never auto-trimmed.
    expect(screen.getByText('9:00:00')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows no notice under the threshold', async () => {
    serve(summary({ running: entry(), todaySeconds: 1500 }));
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    expect(screen.queryByText(/has run for/)).not.toBeInTheDocument();
  });
});
