import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from '@/components/signin-form';

const calls: string[] = [];
const signOut = vi.fn(async () => {
  calls.push('signOut');
  return { error: null };
});
const signInWithOtp = vi.fn(async () => {
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
  it('clears this browser’s stale auth state BEFORE requesting a link', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email'), 'dev@localhost.test');
    await user.click(screen.getByRole('button', { name: /Email me/ }));

    /* Order is the whole point. The PKCE verifier lives under one key per
       origin, so a session left in another tab shares the slot: requesting a
       link without clearing first overwrites the verifier and the eventual
       code exchange fails against the wrong one. */
    await waitFor(() => expect(calls).toEqual(['signOut', 'signInWithOtp']));
  });

  it('signs out locally only, never the user’s other devices', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email'), 'dev@localhost.test');
    await user.click(screen.getByRole('button', { name: /Email me/ }));

    // A global scope would revoke the session on the user's phone because
    // they asked for a link on their laptop.
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('says why the last link failed rather than looking like a dead link', async () => {
    render(<SignInForm error="invalid_link" />);

    /* The callback already redirected here with a reason and nothing
       rendered it, so every failure read as "broken link" — which is how an
       exchange failure went undiagnosed for an hour. */
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/another tab started a different/i);
  });

  it('explains an unrecognised reason instead of rendering nothing', async () => {
    render(<SignInForm error="something_new" />);
    expect(screen.getByRole('alert').textContent).toMatch(/went wrong/i);
  });

  it('shows no error banner on a normal visit', async () => {
    render(<SignInForm />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces the error with confirmation once a link is sent', async () => {
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
});
