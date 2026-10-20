import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { Calendar } from '@/components/calendar';
import { TimerDock } from '@/components/timer-dock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
}));

/**
 * While the kept cache is restored, a query is pending without fetching: its
 * `isLoading` is false although nothing has arrived. A screen that reads that
 * as "loaded" paints empty, then fills in, which is what it must never do.
 */
function restoring({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const persister = {
    persistClient: async () => {},
    restoreClient: () => new Promise<undefined>(() => {}),
    removeClient: async () => {},
  };
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('while the kept cache restores', () => {
  it('the calendar holds its loader, not an empty week', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(<Calendar />, { wrapper: restoring });
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('09', { exact: true })).toBeNull();
  });

  it('the timer bar draws nothing yet', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    render(<TimerDock />, { wrapper: restoring });
    expect(
      screen.getByRole('region', { name: 'Timer' }).firstElementChild,
    ).toHaveAttribute('inert');
  });
});
