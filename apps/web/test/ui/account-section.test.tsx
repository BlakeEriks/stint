import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSection } from '@/components/account-section';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/settings',
}));

const auth = {
  getClaims: vi.fn(async () => ({
    data: { claims: { email: 'dev@localhost.test' } },
  })),
  signOut: vi.fn(async () => ({ error: null })),
};
vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({ auth }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('AccountSection', () => {
  it('signs out from Settings and lands on /signin', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountSection />
      </QueryClientProvider>,
    );

    const button = screen.getByRole('button', { name: 'Sign out' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/signin');
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  });
});
