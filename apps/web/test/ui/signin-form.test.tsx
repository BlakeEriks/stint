import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from '@/components/signin-form';

const calls: string[] = [];
const signOut = vi.fn(async () => {
  calls.push('signOut');
  return { error: null };
});
const signInWithOtp = vi.fn(async (_: unknown) => {
  calls.push('signInWithOtp');
  return { error: null };
});

vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({ auth: { signOut, signInWithOtp } }),
}));

afterEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('SignInForm', () => {
  it('clears this browser’s auth state locally, requests a link that creates no account, and replaces the error with confirmation', async () => {
    const user = userEvent.setup();
    render(<SignInForm inviteUrl="/#invite" error="invalid_link" />);

    await user.type(screen.getByLabelText('Email'), 'dev@localhost.test');
    await user.click(screen.getByRole('button', { name: /Email me/ }));

    /* The PKCE verifier lives under one key per origin, so requesting a link
       without clearing first overwrites another tab's verifier. */
    await waitFor(() => expect(calls).toEqual(['signOut', 'signInWithOtp']));
    // A global scope would revoke the session on the user's phone because
    // they asked for a link on their laptop.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    // Sign-in is invite-only.
    expect(signInWithOtp.mock.calls[0]?.[0]).toMatchObject({
      options: { shouldCreateUser: false },
    });
    // Leaving a stale failure beside "Check your email" would say the new
    // link is broken too.
    await waitFor(() =>
      expect(screen.getByText('Check your email.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains an unrecognized reason instead of rendering nothing', async () => {
    render(<SignInForm inviteUrl="/#invite" error="something_new" />);
    expect(screen.getByRole('alert').textContent).toMatch(/went wrong/i);
  });
});
