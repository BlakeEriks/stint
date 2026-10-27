import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Listing } from '@/components/page';
import { ApiError } from '@/lib/client/api';

const error = (status: number, code: string) =>
  new ApiError(status, { code, message: 'nope' });

const query = <T,>(
  over: Partial<{ data: T; error: unknown; isLoading: boolean }>,
) => ({
  data: undefined,
  error: null,
  isLoading: false,
  ...over,
});

type Query<T> = ReturnType<typeof query<T>>;

const loader = () => screen.queryByRole('status');

describe('Listing', () => {
  it('stays on the loader through the 401 redirect', () => {
    render(
      <Listing query={query({ error: error(401, 'UNAUTHORIZED') })}>
        {() => <p>rows</p>}
      </Listing>,
    );
    expect(loader()).toHaveTextContent('Loading');
    expect(screen.queryByText(/could not load/i)).toBeNull();
  });

  it('keeps showing data when a refetch fails', () => {
    render(
      <Listing query={query({ data: ['a'], error: error(500, 'UNKNOWN') })}>
        {(rows: string[]) => <p>{rows.length} rows</p>}
      </Listing>,
    );
    expect(screen.getByText('1 rows')).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).toBeNull();
  });

  it('keeps its error up while a failed query refetches', () => {
    const list = (q: ReturnType<typeof query<string[]>>) => (
      <Listing query={q}>{(rows) => <p>{rows.length} rows</p>}</Listing>
    );
    const { rerender } = render(list(query({ error: error(500, 'UNKNOWN') })));
    rerender(list(query({ isLoading: true })));
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    expect(loader()).toBeNull();

    rerender(list(query({ data: ['a'] })));
    expect(screen.getByText('1 rows')).toBeInTheDocument();
  });

  /* While the kept cache is restored, a query is pending without fetching:
     that is a wait, not a failure. */
  it('waits on a query that has neither data nor an error yet', () => {
    render(<Listing query={query({})}>{() => <p>rows</p>}</Listing>);
    expect(loader()).toHaveTextContent('Loading');
    expect(screen.queryByText(/could not load/i)).toBeNull();
  });

  /* The server has no cache, so it renders the loader; the browser may have
     restored the region's data before it hydrates. Hydration must match the
     server, and the data follows at once. */
  it('hydrates as the server rendered it, then paints the kept data', async () => {
    // What the server sends: no cache there, so the loader.
    const server = render(
      <Listing query={query({ isLoading: true })}>{() => <p>rows</p>}</Listing>,
    );
    const html = server.container.innerHTML;
    server.unmount();

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const mismatch = vi.fn();
    render(
      <Listing query={query({ data: ['a'] })}>{() => <p>rows</p>}</Listing>,
      { container, hydrate: true, onRecoverableError: mismatch },
    );
    expect(await screen.findByText('rows')).toBeInTheDocument();
    expect(mismatch).not.toHaveBeenCalled();
  });

  /* A query a region shows if it answers: waited for, so it paints with the
     rest, but its failure never blanks the region. */
  describe('given queries it also shows', () => {
    it('waits for them', () => {
      render(
        <Listing query={query({ data: ['a'] })} also={[query({})]}>
          {() => <p>region</p>}
        </Listing>,
      );
      expect(loader()).toHaveTextContent('Loading');
    });

    it('renders without one that failed', () => {
      render(
        <Listing
          query={query({ data: ['a'] })}
          also={[query({ error: error(500, 'UNKNOWN') })]}
        >
          {() => <p>region</p>}
        </Listing>,
      );
      expect(screen.getByText('region')).toBeInTheDocument();
    });
  });

  /* A region paints once, with all its data: nothing of it renders
     until every query it draws from has arrived. */
  describe('given several queries', () => {
    it('shows only the loader until every query has data', () => {
      let calls = 0;
      render(
        <Listing
          query={[query({ data: ['a'] }), query<string[]>({ isLoading: true })]}
        >
          {() => {
            calls += 1;
            return <p>region</p>;
          }}
        </Listing>,
      );
      expect(loader()).toHaveTextContent('Loading');
      expect(screen.queryByText('region')).toBeNull();
      expect(calls, 'the region is never drawn with part of its data').toBe(0);
    });

    it('renders the region once, with every query’s data', () => {
      render(
        <Listing query={[query({ data: ['a', 'b'] }), query({ data: 3 })]}>
          {([rows, n]) => (
            <p>
              {rows.length} rows, {n}
            </p>
          )}
        </Listing>,
      );
      expect(screen.getByText('2 rows, 3')).toBeInTheDocument();
      expect(loader()).toBeNull();
    });

    it('fails the region when any query fails', () => {
      render(
        <Listing
          query={[
            query({ data: ['a'] }),
            query<number>({ error: error(500, 'UNKNOWN') }),
          ]}
        >
          {() => <p>region</p>}
        </Listing>,
      );
      expect(screen.getByText(/could not load/i)).toBeInTheDocument();
      expect(screen.queryByText('region')).toBeNull();
    });

    it('drops a recovered query’s error while another still loads', () => {
      const list = (qs: [Query<string[]>, Query<number>]) => (
        <Listing query={qs}>{() => <p>region</p>}</Listing>
      );
      const { rerender } = render(
        list([query({ error: error(500, 'UNKNOWN') }), query({ data: 1 })]),
      );
      rerender(list([query({ data: ['a'] }), query({ isLoading: true })]));
      expect(loader()).toHaveTextContent('Loading');
      expect(screen.queryByText(/could not load/i)).toBeNull();
    });

    it('keeps the loader when any query is a 401', () => {
      render(
        <Listing
          query={[
            query({ data: ['a'] }),
            query<number>({ error: error(401, 'UNAUTHORIZED') }),
          ]}
        >
          {() => <p>region</p>}
        </Listing>,
      );
      expect(loader()).toHaveTextContent('Loading');
    });

    it('keeps the region through one query’s refetch error', () => {
      render(
        <Listing
          query={[
            query({ data: ['a'] }),
            query({ data: 1, error: error(500, 'UNKNOWN') }),
          ]}
        >
          {() => <p>region</p>}
        </Listing>,
      );
      expect(screen.getByText('region')).toBeInTheDocument();
    });
  });
});
