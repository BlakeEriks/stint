import { getDb } from './db';

/** An address nobody invited, for the sign-in story that shows it. */
export const NOT_INVITED = 'stranger@example.com';

/** The auth calls a story can hold pending: `stalled('signOut')`. */
export const STALLABLE = ['signOut', 'oauth'] as const;
export type Stallable = (typeof STALLABLE)[number];
/** Those held pending, as a server that never answers. */
export const stall = new Set<Stallable>();

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
        stall.has('signOut')
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
  stall.has('oauth')
    ? new Promise<never>(() => {})
    : Promise.resolve({ data: {}, error: null });
