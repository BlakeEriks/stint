import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { captureException } from '@sentry/nextjs';
import AppError from '@/app/(app)/error';
import GlobalError from '@/app/global-error';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

/* A signed-in session whose token carries more than the id, so a report that
   copied the claims would show it. */
vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: 'user-1', email: 'me@example.com' } },
      }),
    },
  }),
}));

/**
 * The screen that renders when a screen fails.
 *
 * Worth testing precisely because it is the code that runs once everything
 * else has: it is never exercised by using the app, so a regression in it is
 * invisible until the day something else breaks and this is what the user
 * meets instead.
 *
 * What is NOT covered here: that Next actually routes a thrown error to this
 * component, and that the frame survives when it does. Neither is reproducible
 * in jsdom — both belong to the framework, not to this file — so they live in
 * `e2e/error-boundary.spec.ts` against a real browser.
 */

// `console.error` is called on purpose, so silence it rather than letting every run print a fake failure.
const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => {
  quiet.mockClear();
  vi.mocked(captureException).mockClear();
});

const boom = (over: Partial<Error & { digest?: string }> = {}) =>
  Object.assign(new Error('Induced'), over);

describe('the screen-level error boundary', () => {
  it('calls reset, which re-renders the segment without a reload', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<AppError error={boom()} reset={reset} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    /* `reset()` and NOT `location.reload()`: a reload would remount the frame
       and with it the running timer, which is the one thing this boundary's
       placement exists to keep alive. */
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('never spends the accent', () => {
    const { container } = render(<AppError error={boom()} reset={vi.fn()} />);

    /* Green means the running timer, which is STILL RUNNING in the frame
       around this. A green recovery button here would put a second meaning
       on the one screen where the first one matters most. */
    const classes = [container, ...container.querySelectorAll('*')].flatMap(
      (el) => Array.from((el as HTMLElement).classList ?? []),
    );
    expect(classes.filter((c) => c.includes('accent'))).toEqual([]);
  });
});

describe.each([
  ['the screen-level boundary', AppError],
  ['the root boundary', GlobalError],
])('%s reports to Sentry', (_, Boundary) => {
  it('sends the error with the user id and nothing else about the user', async () => {
    const error = boom();
    render(<Boundary error={error} reset={vi.fn()} />);

    await waitFor(() =>
      expect(captureException).toHaveBeenCalledWith(error, {
        user: { id: 'user-1' },
      }),
    );
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('leaves a server error to the server, which has reported it', async () => {
    render(<Boundary error={boom({ digest: '123' })} reset={vi.fn()} />);

    await new Promise((r) => setTimeout(r, 0));
    expect(captureException).not.toHaveBeenCalled();
  });
});
