import { it, expect, vi } from 'vitest';
import { setUser } from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), setUser: vi.fn() }));

type Listener = (event: string, session: unknown) => void;
let listener: Listener = () => {};
vi.mock('@/lib/client/supabase', () => ({
  browserClient: () => ({
    auth: {
      onAuthStateChange: (l: Listener) => {
        listener = l;
      },
    },
  }),
}));

it('tags browser errors with the signed-in user id, and only the id, until sign-out', async () => {
  await import('@/instrumentation-client');

  listener('INITIAL_SESSION', {
    user: { id: 'user-1', email: 'me@example.com' },
  });
  expect(setUser).toHaveBeenLastCalledWith({ id: 'user-1' });

  listener('SIGNED_OUT', null);
  expect(setUser).toHaveBeenLastCalledWith(null);
});
