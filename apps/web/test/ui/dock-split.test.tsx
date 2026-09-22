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
 * The drag is a window pointer gesture over a measured box, and jsdom's
 * `getBoundingClientRect` is all zeroes — so the column's is stubbed with a
 * height the fractions can be read against, the same way the entry dialog's
 * scrubber is driven. That is what makes the pointer path assertable: the
 * zero-height guard, the clamp when the pointer leaves the column, and the
 * write landing on release rather than on every move.
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

  /**
   * The pointer path, over a column given a height to divide.
   *
   * The gesture is bound to the WINDOW rather than the handle, because the
   * handle re-renders on every move and pointer capture would go with the
   * element it was set on — so the moves and the release are dispatched
   * there, which is also what lets the pointer leave the column and clamp.
   */
  describe('dragging it', () => {
    const BOX = { top: 100, height: 400 };

    /** The column, measured: `top` 100 and 400 tall, so 300 is halfway. */
    function measured(height = BOX.height) {
      const el = screen.getByLabelText('At a glance');
      el.getBoundingClientRect = () =>
        ({ top: BOX.top, height, bottom: BOX.top + height }) as DOMRect;
      return el;
    }

    /** The clientY that lands on a given fraction of the column. */
    const atFraction = (f: number) => BOX.top + f * BOX.height;

    const move = async (clientY: number) => {
      await act(async () => {
        window.dispatchEvent(
          new PointerEvent('pointermove', { clientY, bubbles: true }),
        );
      });
    };

    const release = async () => {
      await act(async () => {
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      });
    };

    /** Press on the handle, which is what arms the window listeners. */
    const grab = async () => {
      const el = await handle();
      await act(async () => {
        el.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
        );
      });
      return el;
    };

    it('follows the pointer down the column', async () => {
      serve();
      render(<Dock />, { wrapper });
      measured();

      const el = await grab();
      await move(atFraction(0.6));

      expect(el).toHaveAttribute('aria-valuenow', '60');
    });

    it('ignores a column with no height rather than dividing by zero', async () => {
      serve();
      render(<Dock />, { wrapper });
      /* A collapsed or not-yet-laid-out column measures zero. Dividing by it
         gives Infinity, which the clamp would pin to an edge — the split
         would jump to 75% on a move the user has not finished making. */
      measured(0);

      const el = await grab();
      await move(atFraction(0.6));

      expect(el).toHaveAttribute('aria-valuenow', '50');
    });

    it('clamps when the pointer leaves the column', async () => {
      serve();
      render(<Dock />, { wrapper });
      measured();

      const el = await grab();

      // Far below the column's bottom edge.
      await move(BOX.top + BOX.height * 3);
      expect(el).toHaveAttribute('aria-valuenow', '75');

      // And far above its top.
      await move(BOX.top - BOX.height);
      expect(el).toHaveAttribute('aria-valuenow', '25');
    });

    it('writes the ratio on release, not during the drag', async () => {
      serve();
      render(<Dock />, { wrapper });
      measured();

      const el = await grab();
      await move(atFraction(0.6));
      await move(atFraction(0.65));

      /* A drag is ONE decision. Writing per move is a hundred writes for it,
         and it would also persist every value the pointer passed through. */
      expect(localStorage.getItem(KEY)).toBeNull();

      await release();

      expect(el).toHaveAttribute('aria-valuenow', '65');
      expect(localStorage.getItem(KEY)).toBe('0.65');
    });
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
