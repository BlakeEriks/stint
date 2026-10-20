'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation } from './mutations';
import { forgetCache } from './query-cache';
import { keys } from './query-keys';
import { browserClient } from './supabase';

/** Who is signed in, and how to leave. */
export function useAccount() {
  const router = useRouter();
  const queryClient = useQueryClient();
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
    /* `refresh()` as well as `replace()`: the cookie is gone but the server
       components were rendered for a signed-in user, and without the refresh
       a back-navigation would show a cached authenticated page. */
    onSuccess: () => {
      forgetCache(queryClient);
      router.replace('/signin');
      router.refresh();
    },
  });

  return {
    email,
    signOut: () => signOutMutation.mutate(),
    signingOut: signOutMutation.isPending,
  };
}
