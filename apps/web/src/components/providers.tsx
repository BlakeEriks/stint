'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { MutationNotice } from './mutation-notice';

export function Providers({
  children,
  retry = 1,
}: {
  children: React.ReactNode;
  /** Storybook turns it off, so an error state renders without the wait. */
  retry?: number | false;
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
            retry,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <MutationNotice />
    </QueryClientProvider>
  );
}
