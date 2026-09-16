import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Inbox } from '@/components/inbox';
import { useExit } from '@/lib/client/use-exit';
import type { Stats } from '@/lib/client/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as Partial<Element>).getAnimations;
});

/**
 * jsdom implements no Web Animations API, which is exactly why the hook waits
 * on `getAnimations()` rather than an `animationend` listener: absent, it
 * yields nothing to wait on and the promise settles at once. A test that
 * needs a pending animation installs one.
 */
function animating() {
  let settle = () => {};
  const finished = new Promise<void>((r) => {
    settle = r;
  });
  const spy = vi.fn(() => [{ finished }]);
  (Element.prototype as Partial<Element>).getAnimations = spy as never;
  return { finish: () => settle(), calls: () => spy.mock.calls.length };
}

/**
 * The exit is what makes deferring the refetch safe: the row is still in the
 * query data while it plays, so nothing has to be reconstructed once it goes.
 *
 * jsdom runs no animations, so `getAnimations()` returns `[]` and every wait
 * resolves on a microtask — no fake timers, no bail. What is tested here is
 * the ORDER, which is the part a browser cannot be relied on to reveal.
 */
describe('useExit', () => {
  /** A list that marks its row and reports when the wait resolved. */
  function Harness({ onDone }: { onDone: () => void }) {
    const exit = useExit();
    return (
      <ul>
        <li ref={exit.register('r1')} data-exiting={exit.exiting.has('r1')}>
          <button
            type="button"
            onClick={async () => {
              await exit.mark('r1');
              onDone();
            }}
          >
            Act
          </button>
        </li>
      </ul>
    );
  }

  it('marks the row, then resolves', async () => {
    const done = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDone={done} />);

    await user.click(screen.getByRole('button', { name: 'Act' }));

    /* Both halves matter: the row is flagged so the CSS can play it out, and
       the promise settles so the caller knows when to refetch. */
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-exiting',
      'true',
    );
  });

  it("waits on the row's own animations", async () => {
    const animation = animating();
    const done = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDone={done} />);

    await user.click(screen.getByRole('button', { name: 'Act' }));
    await waitFor(() => expect(animation.calls()).toBeGreaterThan(0));

    /* Not an `animationend` listener and no timeout to bail on: the wait is
       the animation's own promise, so a row with none resolves immediately
       and a row with several waits for the last. */
    expect(done).not.toHaveBeenCalled();
    await act(async () => {
      animation.finish();
    });
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('lets style resolve before it looks for animations', async () => {
    /* The bug this pins down: a `requestAnimationFrame` callback runs BEFORE
       style recalc, so one frame after setting the attribute the transition
       does not exist yet. `getAnimations()` returned nothing, the wait
       resolved at once, the refetch dropped the row, and the exit never
       played — measured in Chrome as 0 animations at one frame and 2 at two.

       Here the animation only becomes visible on the SECOND frame, so a hook
       that looks too early sees an empty list and resolves early. */
    let frame = 0;
    const raf = globalThis.requestAnimationFrame;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frame += 1;
      return raf(cb);
    });

    let settle = () => {};
    const finished = new Promise<void>((r) => {
      settle = r;
    });
    (Element.prototype as Partial<Element>).getAnimations = (() =>
      frame >= 2 ? [{ finished }] : []) as never;

    const done = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDone={done} />);

    await user.click(screen.getByRole('button', { name: 'Act' }));
    await waitFor(() => expect(frame).toBeGreaterThanOrEqual(2));

    // It found the animation, so it is still waiting on it.
    expect(done).not.toHaveBeenCalled();
    await act(async () => {
      settle();
    });
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('short-circuits under prefers-reduced-motion', async () => {
    const animation = animating();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );

    const done = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDone={done} />);

    await user.click(screen.getByRole('button', { name: 'Act' }));

    /* No frame waited on and no animation consulted — the row still has to
       go, it simply goes at once. */
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(animation.calls()).toBe(0);
  });
});

/**
 * The order the whole design rests on.
 *
 * The previous implementation invalidated first, the refetch dropped the row,
 * and seven mechanisms existed to rebuild what it had destroyed. Nothing here
 * reconstructs anything, because nothing is destroyed early.
 */
describe('an inbox row leaving', () => {
  const overdue = {
    invoiceId: 'i1',
    invoiceNumber: 'STINT-0001',
    clientId: 'c1',
    clientName: 'Northwind',
    amount: 900,
    currency: 'USD',
    daysLate: 12,
  };

  function stats(attention: Partial<Stats['attention']> = {}): Stats {
    return {
      currency: 'USD',
      unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
      pace: null,
      billableRatio: null,
      awaitingPayment: 0,
      attention: {
        overdueInvoices: [],
        staleDrafts: [],
        unprojected: [],
        strangeDurations: [],
        ...attention,
      },
    } as Stats;
  }

  it('plays the exit before the refetch that removes it', async () => {
    const animation = animating();
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(String(url));
        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    const user = userEvent.setup();
    render(<Inbox stats={stats({ overdueInvoices: [overdue] })} />, {
      wrapper,
    });

    await user.click(
      screen.getByRole('button', { name: 'Mark STINT-0001 paid' }),
    );

    // The write went; the row is playing out and is still on screen.
    await waitFor(() =>
      expect(fetched.some((u) => u.includes('/invoices/i1'))).toBe(true),
    );
    const before = fetched.length;
    expect(screen.getByText('Northwind')).toBeInTheDocument();

    /* Nothing has been invalidated yet. If it had, the refetch would already
       have dropped the row and the animation would be playing over a gap. */
    expect(fetched.filter((u) => u.includes('/stats'))).toEqual([]);

    await act(async () => {
      animation.finish();
    });

    // Only once the exit is done does anything go looking for new data.
    await waitFor(() => expect(fetched.length).toBeGreaterThan(before));
  });

  it('gives the runaway row the same exit as every other row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              running: {
                id: 'e1',
                taskName: 'Writing',
                projectId: null,
                startedAt: '2026-09-11T09:00:00.000Z',
                endedAt: null,
                isBillable: true,
                durationSeconds: null,
              },
              todaySeconds: 32_400,
              weekSeconds: 32_400,
              exceedsThreshold: true,
              maxTimerHours: 8,
              serverTime: '2026-09-11T18:00:00.000Z',
            }),
            { status: 200 },
          ),
      ),
    );

    const user = userEvent.setup();
    render(<Inbox stats={stats()} />, { wrapper });

    const row = (await screen.findByText(/9 hours so far/)).closest('li');
    expect(row).toHaveClass('exit-collapse');

    /* It comes from the timer and has no entry id, but a synthetic one keeps
       it on the single path rather than giving it a parallel one. Keep is
       local state and still leaves the same way. */
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(screen.queryByText(/hours so far/)).toBeNull());
  });
});
