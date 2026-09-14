import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Listing } from '@/components/page';
import { ApiError } from '@/lib/client/api';

/**
 * What a failed query is allowed to replace.
 *
 * Two of these three cases render the failure over content the user was
 * mid-way through, which is the regression: a signed-out 401 is a navigation
 * already in flight, and a failed refetch still holds the data it is
 * refreshing.
 */

const error = (status: number, code: string) =>
  new ApiError(status, { code, message: 'nope' });

const query = <T,>(over: Partial<{ data: T; error: unknown }>) => ({
  data: undefined,
  error: null,
  isLoading: false,
  ...over,
});

describe('Listing', () => {
  it('reports a failure that left it with nothing to show', () => {
    render(
      <Listing query={query({ error: error(500, 'UNKNOWN') })}>
        {() => <p>rows</p>}
      </Listing>,
    );
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });

  it('stays on loading through the 401 redirect', () => {
    render(
      <Listing query={query({ error: error(401, 'UNAUTHORIZED') })}>
        {() => <p>rows</p>}
      </Listing>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
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
});
