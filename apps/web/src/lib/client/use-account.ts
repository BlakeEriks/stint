'use client';

import { useEffect, useState } from 'react';
import { useOptimisticMutation } from './mutations';
import { forgetCache } from './query-cache';
import { keys } from './query-keys';
import { browserClient } from './supabase';

/** Who is signed in, and how to leave. */
export function useAccount() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    browserClient()
      .auth.getClaims()
      .then(({ data }) => {
        if (alive) setEmail((data?.claims?.email as string) ?? null);
      })
      // The menu falls back to a generic label; sign-out still works.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const signOutMutation = useOptimisticMutation({
    mutationFn: async () => {
      // Supabase reports a failed sign-out in the result; it does not throw.
      const { error } = await browserClient().auth.signOut();
      if (error) throw new Error(`Couldn’t sign out: ${error.message}`);
    },
    queryKey: keys.session,
    /* A full load, not the router: the server components were rendered for
       a signed-in user, and a soft navigation leaves them cached for Back.
       A soft one also commits late, so the 401s of queries still on screen
       would send a second, hard navigation after it. The kept cache goes
       first, so the next account never paints this one's numbers. */
    onSuccess: () => {
      forgetCache();
      window.location.replace('/signin');
    },
  });

  return {
    email,
    signOut: () => signOutMutation.mutate(),
    signingOut: signOutMutation.isPending,
  };
}
