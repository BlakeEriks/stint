import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CACHE_KEY, forgetCache } from '@/lib/client/query-cache';
import { AccountMenu } from '@/components/account-menu';
import { SignInForm } from '@/components/signin-form';
import { ApiError, api } from '@/lib/client/api';

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
  it('is forgotten from memory and from the browser', () => {
    const client = new QueryClient();
    client.setQueryData(['stats'], { earned: 1 });
    forgetCache(client);
    expect(client.getQueryData(['stats'])).toBeUndefined();
    expect(kept()).toBeNull();
  });

  it('is forgotten on Sign out', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace });
    const client = new QueryClient();
    const user = userEvent.setup();
    render(<AccountMenu />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
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
    render(<SignInForm inviteUrl="/#invite" />);
    expect(kept()).toBeNull();
  });
});
