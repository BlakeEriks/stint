import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from '@/components/signin-form';

const signInWithOtp = vi.fn(
  async (
    _: unknown,
  ): Promise<{ error: { code: string; message: string } | null }> => ({
    error: null,
  }),
);

vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({ auth: { signInWithOtp } }),
}));

afterEach(() => vi.clearAllMocks());

describe('SignInForm', () => {
  it('requests a link and replaces the error with confirmation', async () => {
    const user = userEvent.setup();
    render(<SignInForm error="invalid_link" />);

    await user.type(screen.getByLabelText('Email'), 'dev@localhost.test');
    await user.click(screen.getByRole('button', { name: /Email me/ }));

    // Leaving a stale failure beside "Check your email" would say the new
    // link is broken too.
    await waitFor(() =>
      expect(screen.getByText('Check your email.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains an unrecognized reason instead of rendering nothing', async () => {
    render(<SignInForm error="something_new" />);
    expect(screen.getByRole('alert').textContent).toMatch(
      /that link didn.t work/i,
    );
  });
});
