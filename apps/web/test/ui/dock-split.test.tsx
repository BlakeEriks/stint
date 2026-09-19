import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Dock } from '@/components/dock';

/**
 * The divider between the inbox and Today, and the ratio it sets.
 *
 * jsdom has no layout, so the heights are not assertable here — what is
 * tested is the contract around them: the range the handle clamps to, that
 * the ratio is stored per device, and that the handle exists only where a
 * column has a height to divide.
 *
 * The drag itself is a window pointer gesture over a measured box, which is
 * exactly what jsdom cannot provide (`getBoundingClientRect` is all zeroes).
 * The keyboard path moves the same state through the same clamp, so it is
 * what the range is asserted through.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const KEY = 'stint.dock.split';

/** `xl` and up, where the dock is a column with a height to split. */
function atXl(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function serve() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stats'))
        return new Response(
          JSON.stringify({
            currency: 'USD',
            unbilled: { total: 0, seconds: 0, byClient: [], moreClients: 0 },
            velocity: {
              months: 3,
              total: 0,
              perMonth: 0,
              invoiced: 0,
              unbilled: 0,
              seconds: 0,
              byClient: [],
              moreClients: 0,
            },
            pace: null,
            billableRatio: null,
            awaitingPayment: 0,
            earnedToday: 0,
            attention: {
              overdueInvoices: [],
              staleDrafts: [],
              unprojected: [],
              strangeDurations: [],
            },
          }),
          { status: 200 },
        );
      if (url.includes('/entries'))
        return new Response(JSON.stringify({ entries: [] }), { status: 200 });
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

const handle = () => screen.findByRole('slider', { name: /Resize/ });

const press = async (key: string, times = 1) => {
  const el = await handle();
  for (let i = 0; i < times; i++) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  }
  return el;
};

beforeEach(() => {
  atXl(true);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the dock split', () => {
  it('starts at half', async () => {
    serve();
    render(<Dock />, { wrapper });

    expect(await handle()).toHaveAttribute('aria-valuenow', '50');
  });

  it('moves with the arrow keys and remembers where it landed', async () => {
    serve();
    render(<Dock />, { wrapper });

    const el = await press('ArrowDown');
    expect(el).toHaveAttribute('aria-valuenow', '55');

    /* Written on the nudge, because a keypress is already the whole decision
       — there is no release to wait for. */
    expect(localStorage.getItem(KEY)).toBe('0.55');
  });

  it('clamps rather than letting either region reach zero', async () => {
    serve();
    render(<Dock />, { wrapper });

    /* Far more presses than the range holds. A region dragged to nothing is
       one you forget is there, and the handle would end up flush against an
       edge with nothing to grab. */
    let el = await press('ArrowDown', 20);
    expect(el).toHaveAttribute('aria-valuenow', '75');

    el = await press('ArrowUp', 40);
    expect(el).toHaveAttribute('aria-valuenow', '25');
  });

  it('restores the stored ratio', async () => {
    localStorage.setItem(KEY, '0.7');
    serve();
    render(<Dock />, { wrapper });

    expect(await handle()).toHaveAttribute('aria-valuenow', '70');
  });

  it('ignores a stored value outside the range', async () => {
    /* Storage is the user's and survives a change to the bounds, so a value
       from a previous range is clamped rather than trusted. */
    localStorage.setItem(KEY, '0.95');
    serve();
    render(<Dock />, { wrapper });

    expect(await handle()).toHaveAttribute('aria-valuenow', '75');
  });

  it('ignores junk in storage', async () => {
    localStorage.setItem(KEY, 'not a number');
    serve();
    render(<Dock />, { wrapper });

    expect(await handle()).toHaveAttribute('aria-valuenow', '50');
  });

  it('Home recentres and forgets the preference', async () => {
    serve();
    render(<Dock />, { wrapper });

    await press('ArrowDown', 3);
    const el = await press('Home');

    expect(el).toHaveAttribute('aria-valuenow', '50');
    /* Removed, not written as the default: a stored value is a CHOICE, and
       reset means there is no longer one to restore. */
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('has no handle below xl', async () => {
    atXl(false);
    serve();
    render(<Dock />, { wrapper });

    /* The dock is a band beneath the content there, sized by what it holds.
       There is no height to divide, so a divider would set a ratio of
       nothing. */
    await screen.findByLabelText('Inbox');
    expect(
      screen.queryByRole('slider', { name: /Resize/ }),
    ).not.toBeInTheDocument();
  });
});
