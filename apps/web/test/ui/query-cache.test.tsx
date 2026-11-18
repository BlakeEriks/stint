import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CACHE_KEY, forgetCache } from '@/lib/client/query-cache';
import { AccountMenu } from '@/components/account-menu';
import { SignInForm } from '@/components/signin-form';
import { ApiError, api } from '@/lib/client/api';
import { Providers } from '@/components/providers';

/**
 * The last answers are kept in this browser so a reload paints at once
 *. No account may ever see another's: every way out forgets them.
 */

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
}));
const auth = {
  getClaims: vi.fn(async () => ({ data: { claims: { email: 'a@b.test' } } })),
  signOut: vi.fn(async () => ({ error: null })),
  signInWithOtp: vi.fn(async () => ({ error: null })),
};
vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({ auth }),
}));

const kept = () => localStorage.getItem(CACHE_KEY);

beforeEach(() => {
  localStorage.setItem(CACHE_KEY, '{"clientState":{"queries":[]}}');
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('the kept cache', () => {
  it('is forgotten from the browser', () => {
    forgetCache();
    expect(kept()).toBeNull();
  });

  it('is forgotten on Sign out', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    const user = userEvent.setup();
    render(<AccountMenu />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient()}>
          {children}
        </QueryClientProvider>
      ),
    });
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin'));
    expect(kept()).toBeNull();
  });

  it('is forgotten when the session has expired', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, pathname: '/', assign });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ code: 'UNAUTHORIZED', message: 'no' }),
            { status: 401 },
          ),
      ),
    );
    await expect(api.settings()).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith('/signin');
    expect(kept()).toBeNull();
  });

  it('is forgotten whenever the sign-in page opens', () => {
    render(<SignInForm />);
    expect(kept()).toBeNull();
  });
});

/* The cache is written at most once a second, so a reload right after a
   write can restore the answer from before it, younger than `staleTime`. */
it('asks the server again for what it restores, however young', async () => {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      buster: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
      timestamp: Date.now(),
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['kept'],
            queryHash: '["kept"]',
            state: {
              data: 'before',
              dataUpdatedAt: Date.now(),
              status: 'success',
            },
          },
        ],
      },
    }),
  );
  function Kept() {
    const { data } = useQuery({
      queryKey: ['kept'],
      queryFn: async () => 'after',
    });
    return <p>{data}</p>;
  }
  render(
    <Providers>
      <Kept />
    </Providers>,
  );
  expect(await screen.findByText('after')).toBeTruthy();
});
