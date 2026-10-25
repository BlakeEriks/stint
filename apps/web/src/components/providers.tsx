'use client';

import {
  defaultShouldDehydrateQuery,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { CACHE_MAX_AGE, cachePersister } from '@/lib/client/query-cache';
import { followRunningTimer } from '@stint/client';
import { MutationNotice } from './mutation-notice';

export function Providers({
  children,
  retry = 1,
  persist = true,
}: {
  children: React.ReactNode;
  /** Storybook turns it off, so an error state renders without the wait. */
  retry?: number | false;
  /** Storybook turns it off, so one story's data never paints another. */
  persist?: boolean;
}) {
  // One client per browser session, created lazily so it is never shared
  // across requests on the server.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The timer ticks locally; refetching on focus is how a tab that
            // was in the background reconciles with the server.
            refetchOnWindowFocus: true,
            staleTime: 10_000,
            /* As long as the kept cache lives, so a query restored from it is
               still there when its screen asks. */
            gcTime: CACHE_MAX_AGE,
            retry,
          },
        },
      }),
  );

  useEffect(() => followRunningTimer(client), [client]);

  /* The last answers, kept in this browser so a reload paints them at once;
     each is stale on arrival, so its screen refetches and the server's answer
     replaces it. Created in the browser only. */
  const [persister] = useState(() =>
    persist && typeof window !== 'undefined' ? cachePersister() : undefined,
  );

  if (!persister) {
    return (
      <QueryClientProvider client={client}>
        {children}
        <MutationNotice />
      </QueryClientProvider>
    );
  }
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // A cache written by another build may not match this one's shapes.
        buster: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
        dehydrateOptions: {
          /* Not who is signed in, nor the account behind the delete dialog:
             those are answered fresh. */
          shouldDehydrateQuery: (q) =>
            defaultShouldDehydrateQuery(q) &&
            q.queryKey[0] !== 'session' &&
            q.queryKey[0] !== 'account',
        },
      }}
    >
      {children}
      <MutationNotice />
    </PersistQueryClientProvider>
  );
}
