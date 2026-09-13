import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppError from '@/app/(app)/error';

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

// `console.error` is called on purpose (it is the only place these go today),
// so silence it rather than letting every run print a fake failure.
const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => quiet.mockClear());

const boom = (over: Partial<Error & { digest?: string }> = {}) =>
  Object.assign(new Error('Induced'), over);

describe('the screen-level error boundary', () => {
  it('offers recovery before anything else', () => {
    render(<AppError error={boom()} reset={vi.fn()} />);

    /* Most of what reaches here is transient — a failed fetch, a route
       rendered mid-deploy — so the first thing offered is the cheap fix. */
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

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

  it('says the tracked time is safe, because that is the real fear', () => {
    render(<AppError error={boom()} reset={vi.fn()} />);

    /* This app is a timer. A blank error screen reads as "it lost my hours",
       and the frame behind this one is still ticking — so the copy says so
       rather than leaving the user to guess. */
    expect(screen.getByText(/tracked time is safe/i)).toBeInTheDocument();
  });

  it('shows the digest, which is the only handle on a server error', () => {
    render(<AppError error={boom({ digest: 'abc123' })} reset={vi.fn()} />);

    /* Next withholds a server error's MESSAGE from the client in production
       so an internal detail cannot leak onto someone's screen. The digest is
       what ties this screen to the server log, so a user who can quote it
       makes a bug report actionable. */
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('renders nothing about a reference when there is no digest', () => {
    render(<AppError error={boom()} reset={vi.fn()} />);

    // A client-side error has no digest. An empty "Reference" would be noise
    // pretending to be a handle on something.
    expect(screen.queryByText(/reference/i)).toBeNull();
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
