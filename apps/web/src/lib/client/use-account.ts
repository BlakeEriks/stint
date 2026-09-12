'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from './supabase';

/**
 * Who is signed in, and how to leave.
 *
 * The email is read from the JWT's claims rather than fetched: `getClaims()`
 * verifies the signature locally against a cached JWKS, so identity costs no
 * network round-trip. `getUser()` would call the Auth server on every render
 * of whichever screen shows the account menu.
 */
export function useAccount() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    browserClient()
      .auth.getClaims()
      .then(({ data }) => {
        if (alive) setEmail((data?.claims?.email as string) ?? null);
      })
      // A missing email is not worth surfacing: the menu falls back to a
      // generic label and sign-out still works.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const signOut = async () => {
    await browserClient().auth.signOut();
    /* `refresh()` as well as `replace()`: the cookie is gone but the server
       components were rendered for a signed-in user, and without the refresh
       a back-navigation would show a cached authenticated page. */
    router.replace('/signin');
    router.refresh();
  };

  return { email, signOut };
}
