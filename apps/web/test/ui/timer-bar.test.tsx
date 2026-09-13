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
  { id: 'p1', name: 'Acme Redesign' },
  { id: 'p2', name: 'Bluebird API' },
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

const renderBar = () => render(<TimerBar projects={PROJECTS} />, { wrapper });

const taskInput = () => screen.getByLabelText('Task name');

/**
 * Enter rename mode on a running timer.
 *
 * While running, the task name is TEXT — a running timer is read far more
 * often than it is edited, and a permanently focusable field turns a stray
 * click into a rename of billable work. The field appears only after the
 * pencil, so every rename test goes through here.
 */
const startRename = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Rename task' }));
  return taskInput();
};

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
    expect(screen.getByText('Writing')).toBeInTheDocument();
    // 25 minutes, counted from startedAt.
    expect(screen.getByText('0:25:00')).toBeInTheDocument();
  });

  it('shows the running task as text, not an editable field', async () => {
    serve(runningSummary());
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    /* The name is read on every screen and edited rarely; a live input makes
       a stray click a rename of billable work. */
    expect(screen.queryByLabelText('Task name')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Rename task' }),
    ).toBeInTheDocument();
  });

  it('offers the rename control without needing hover', async () => {
    /* Hover-to-reveal would hide the only edit affordance on touch, and a
       name typed wrong at the start is otherwise uncorrectable until the
       entry is stopped. jsdom has no hover, so merely finding it proves it
       is not gated behind one. */
    serve(runningSummary());
    renderBar();

    const pencil = await screen.findByRole('button', { name: 'Rename task' });
    expect(pencil).toBeVisible();
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
    await startRename(user);
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
   * The edit has to actually happen and then be undone, so the comparison in
   * `commitRename` is genuinely reached rather than short-circuited.
   */
  it('does not patch when the task name ends up unchanged', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    await startRename(user);
    /* The field opens with its text selected, so typing would REPLACE the
       name rather than append to it. Collapse the selection first — this is
       the difference between editing "Writing" and editing "". */
    await user.keyboard('{End}!{Backspace}');
    await user.tab();

    expect(screen.getByText('Writing')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('reverts an in-progress rename on Escape', async () => {
    const calls = serve(runningSummary());
    const user = userEvent.setup();
    renderBar();

    await screen.findByRole('button', { name: 'Stop timer' });
    await startRename(user);
    await user.clear(taskInput());
    await user.type(taskInput(), 'Scratch that{Escape}');

    /* Back to text, showing the server's name — Escape abandons the edit
       rather than merely closing the field on whatever was typed. */
    expect(screen.getByText('Writing')).toBeInTheDocument();
    expect(screen.queryByLabelText('Task name')).toBeNull();
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

describe('the runaway timer choice', () => {
  /* `principles.md`: the app surfaces the problem and NEVER modifies the
     entry itself. All three of keep / adjust / discard are the user's, and
     the notice must not act on its own. */
  const runaway = () =>
    summary({
      running: entry({ startedAt: '2026-09-10T09:00:00.000Z' }),
      maxTimerHours: 8,
    });

  it('offers keep, adjust and discard past the threshold', async () => {
    serve(runaway());
    render(<TimerBar projects={PROJECTS} />, { wrapper });

    await waitFor(() =>
      expect(screen.getByText(/has run for/)).toBeInTheDocument(),
    );
    for (const name of ['Keep', 'Adjust', 'Discard']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('keeps the timer running when Keep is chosen', async () => {
    const calls = serve(runaway());
    const user = userEvent.setup();
    render(<TimerBar projects={PROJECTS} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Keep' }));

    /* A long timer is often correct. Keep must dismiss the notice and touch
       nothing — stopping it here would be the app editing billable work. */
    expect(calls).toEqual([]);
    expect(screen.queryByText(/has run for/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Stop timer' }),
    ).toBeInTheDocument();
  });

  it('does not discard until the confirmation is clicked', async () => {
    const calls = serve(runaway());
    const user = userEvent.setup();
    render(<TimerBar projects={PROJECTS} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    /* Discarding a 16-hour entry you actually worked is not recoverable, so
       the first click only asks. */
    expect(calls).toEqual([]);
    expect(screen.getByText(/Delete this entry\?/)).toBeInTheDocument();
  });

  it('stops before adjusting, because a running entry has no end to edit', async () => {
    const calls = serve(runaway());
    const user = userEvent.setup();
    render(<TimerBar projects={PROJECTS} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Adjust' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/timer/stop' });
  });
});
