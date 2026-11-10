import { getDb } from './db';

/** An address nobody invited, for the sign-in story that shows it. */
export const NOT_INVITED = 'stranger@example.com';

/** Holds a call pending, as a server that never answers: `stalled('signOut')`. */
export const stall = { signOut: false, oauth: false };

/**
 * Stands in for `src/lib/client/supabase.ts` in Storybook: the signed-in
 * account is the fake one, and every auth call succeeds without a network,
 * except a sign-in by `NOT_INVITED`. `.storybook/vite-mocks.mts` swaps it in.
 */
export function browserClient() {
  return {
    auth: {
      getClaims: async () => ({
        data: { claims: { email: getDb().email } },
        error: null,
      }),
      signOut: () =>
        stall.signOut
          ? new Promise<{ error: null }>(() => {})
          : Promise.resolve({ error: null }),
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
      oauth: {
        approveAuthorization: () => answer(),
        denyAuthorization: () => answer(),
      },
    },
  };
}

const answer = () =>
  stall.oauth
    ? new Promise<never>(() => {})
    : Promise.resolve({ data: {}, error: null });
