import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '@/components/account-menu';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
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

describe('AccountMenu', () => {
  it('offers sign out, which the app previously had nowhere at all', async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);

    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    );

    /* Clearing the session is the point; `refresh` matters as much as the
       redirect, because the server components were rendered for a signed-in
       user and a Back navigation would otherwise show cached markup. */
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/signin');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('still works when the token carries no email', async () => {
    auth.getClaims.mockResolvedValueOnce({ data: { claims: {} } } as never);
    const user = userEvent.setup();
    render(<AccountMenu />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Account' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
