import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useProject } from '@/lib/client/use-project-colors';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

describe('useProject', () => {
  it('finds a project only the archived-included list has', async () => {
    const legacy = { id: 'p-old', clientId: 'c-gone', name: 'Legacy retainer' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const projects = String(url).includes('includeArchived=true')
          ? [legacy]
          : [];
        return new Response(JSON.stringify({ projects }), { status: 200 });
      }),
    );

    const { result } = renderHook(() => useProject('p-old'), { wrapper });

    await waitFor(() => expect(result.current?.name).toBe('Legacy retainer'));
  });
});
