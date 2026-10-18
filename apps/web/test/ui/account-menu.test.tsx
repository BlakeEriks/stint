import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { MutationNotice } from '@/components/mutation-notice';

const replace = vi.fn();
beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, replace });
});

const auth = {
  getClaims: vi.fn(async () => ({
    data: { claims: { email: 'dev@localhost.test' } },
  })),
  signOut: vi.fn(async () => ({ error: null })),
};
vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({ auth }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
      <MutationNotice />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AccountMenu', () => {
  it('offers sign out, which the app previously had nowhere at all', async () => {
    const user = userEvent.setup();
    render(<AccountMenu />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signin'));
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('still works when the token carries no email', async () => {
    auth.getClaims.mockResolvedValueOnce({ data: { claims: {} } } as never);
    const user = userEvent.setup();
    render(<AccountMenu />, { wrapper });

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

  it('stays put and says why when sign-out fails', async () => {
    auth.signOut.mockResolvedValueOnce({
      error: { message: 'Network request failed' },
    } as never);
    const user = userEvent.setup();
    render(<AccountMenu />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /sign out/i }),
    );

    expect(
      await screen.findByText('Couldn’t sign out: Network request failed'),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
