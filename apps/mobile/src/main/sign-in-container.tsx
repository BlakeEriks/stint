import { ApiError } from '@stint/client';
import { useState } from 'react';
import { SignInScreen } from '../screens/sign-in-screen.tsx';
import type { Auth } from '../session.ts';

/**
 * The two sign-in steps: Stint sends the code, GoTrue checks it. A send or a check is the server's
 * to decide, so the button shows it is pending until the answer
 * (Constitution VI); a success signs in through `auth`'s listeners.
 */
export function SignInContainer({
  auth,
  sendCode,
}: {
  auth: Auth;
  sendCode: (email: string) => Promise<void>;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const attempt = async (call: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await call();
    } catch (e) {
      // A refusal, or no network; anything else is a bug.
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof TypeError)
        setError('Can’t reach Stint. Check your internet connection.');
      else throw e;
    } finally {
      setPending(false);
    }
  };

  return (
    <SignInScreen
      sentTo={sentTo}
      error={error}
      pending={pending}
      onSend={(email) =>
        attempt(async () => {
          await sendCode(email);
          setSentTo(email);
        })
      }
      onVerify={(code) => attempt(() => auth.verifyCode(sentTo ?? '', code))}
      onDifferentEmail={() => {
        setSentTo(null);
        setError(null);
      }}
    />
  );
}
