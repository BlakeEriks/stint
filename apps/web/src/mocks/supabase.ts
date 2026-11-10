import { getDb } from './db';

/** The auth calls a story can hold pending: `stalled('signOut')`. */
export const STALLABLE = ['signOut', 'oauth'] as const;
export type Stallable = (typeof STALLABLE)[number];
/** Those held pending, as a server that never answers. */
export const stall = new Set<Stallable>();

/** What `signInWithOtp` answers with; a story sets it in `beforeEach`. */
export const otp: { error: { code: string; message: string } | null } = {
  error: null,
};

/**
 * Stands in for `src/lib/client/supabase.ts` in Storybook: the signed-in
 * account is the fake one, and every auth call succeeds without a network.
 * `.storybook/vite-mocks.mts` swaps it in.
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
      signInWithOtp: async () => ({ data: {}, error: otp.error }),
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
