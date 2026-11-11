import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from '@/components/signin-form';

const calls: string[] = [];
const signOut = vi.fn(async () => {
  calls.push('signOut');
  return { error: null };
});
const signInWithOtp = vi.fn(
  async (
    _: unknown,
  ): Promise<{ error: { code: string; message: string } | null }> => {
    calls.push('signInWithOtp');
    return { error: null };
  },
);

vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({ auth: { signOut, signInWithOtp } }),
}));

/* Cloudflare's widget, as a button that hands out a token. Each mount's
   token is new, as a remounted widget's is. */
let mounts = 0;
vi.mock('@/components/turnstile', async () => {
  const { useState } = await import('react');
  return {
    Turnstile: ({ onToken }: { onToken: (t: string) => void }) => {
      const [n] = useState(() => ++mounts);
      return (
        <button type="button" onClick={() => onToken(`token-${n}`)}>
          I am human
        </button>
      );
    },
  };
});

afterEach(() => {
  calls.length = 0;
  mounts = 0;
  vi.clearAllMocks();
});

describe('SignInForm', () => {
  it('clears this browser’s auth state locally, requests a link, and replaces the error with confirmation', async () => {
    const user = userEvent.setup();
    render(<SignInForm error="invalid_link" />);

    await user.type(screen.getByLabelText('Email'), 'dev@localhost.test');
    await user.click(screen.getByRole('button', { name: /Email me/ }));

    /* The PKCE verifier lives under one key per origin, so requesting a link
       without clearing first overwrites another tab's verifier. */
    await waitFor(() => expect(calls).toEqual(['signOut', 'signInWithOtp']));
    // A global scope would revoke the session on the user's phone because
    // they asked for a link on their laptop.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    // Leaving a stale failure beside "Check your email" would say the new
    // link is broken too.
    await waitFor(() =>
      expect(screen.getByText('Check your email.')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains an unrecognized reason instead of rendering nothing', async () => {
    render(<SignInForm error="something_new" />);
    expect(screen.getByRole('alert').textContent).toMatch(/went wrong/i);
  });

  it('sends the CAPTCHA’s token, and a fresh one after a refusal', async () => {
    const user = userEvent.setup();
    signInWithOtp.mockResolvedValueOnce({
      error: { code: 'captcha_failed', message: 'captcha protection' },
    });
    render(<SignInForm captchaSiteKey="site-key" />);
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    const send = screen.getByRole('button', { name: /Email me/ });

    await user.click(screen.getByRole('button', { name: 'I am human' }));
    await user.click(send);
    await waitFor(() =>
      expect(signInWithOtp.mock.calls[0]?.[0]).toMatchObject({
        options: { captchaToken: 'token-1' },
      }),
    );
    // The spent token is gone with the widget that drew it.
    await user.click(screen.getByRole('button', { name: 'I am human' }));
    await user.click(send);
    await waitFor(() =>
      expect(signInWithOtp.mock.calls[1]?.[0]).toMatchObject({
        options: { captchaToken: 'token-2' },
      }),
    );
  });
});
