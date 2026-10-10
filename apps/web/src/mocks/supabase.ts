import { getDb } from './db';

/**
 * Stands in for `src/lib/client/supabase.ts` in Storybook: the signed-in
 * account is the fake one, and every auth call succeeds without a network.
 * `.storybook/vite-mocks.mts` swaps it in.
 */
export const NOT_INVITED = 'stranger@example.com';

export function browserClient() {
  return {
    auth: {
      getClaims: async () => ({
        data: { claims: { email: getDb().email } },
        error: null,
      }),
      signOut: async () => ({ error: null }),
      // An address nobody invited, for the sign-in story that shows it.
      signInWithOtp: async ({ email }: { email: string }) =>
        email === NOT_INVITED
          ? {
              data: {},
              error: {
                code: 'otp_disabled',
                message: 'Signups not allowed for otp',
              },
            }
          : { data: {}, error: null },
    },
  };
}
