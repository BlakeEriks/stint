import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Nav } from '@/components/nav';

/* Nav mounts the account menu, which needs a router to leave on sign-out. */
vi.mock('next/navigation', () => ({
  usePathname: () => '/clients',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

describe('Nav', () => {
  it('reaches projects through Clients, with no Projects section', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    render(<Nav />, { wrapper });

    /* Clients lists every project under its client, so a second section
       for the same hierarchy is a choice with no right answer. */
    const nav = within(screen.getByRole('navigation', { name: 'Sections' }));
    expect(nav.getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'href',
      '/clients',
    );
    expect(nav.queryByRole('link', { name: 'Projects' })).toBeNull();
  });
});
