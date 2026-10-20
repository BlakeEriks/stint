import { describe, it, expect } from 'vitest';
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
