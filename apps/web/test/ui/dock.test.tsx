import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Dock } from '@/components/dock';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

/**
 * `/stats` never resolves; everything else answers. The dock paints once,
 * with all of it, so Today waits for the figure its header carries.
 */
function serveAllButStats() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/stats')) return new Promise<Response>(() => {});
      if (url.includes('/entries'))
        return new Response(
          JSON.stringify({
            entries: [
              {
                id: 'e1',
                taskName: 'Writing',
                projectId: null,
                startedAt: '2026-09-11T09:00:00.000Z',
                endedAt: '2026-09-11T10:00:00.000Z',
                isBillable: true,
                durationSeconds: 3600,
              },
            ],
          }),
          { status: 200 },
        );
      if (url.includes('/projects'))
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-11T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Dock', () => {
  it('holds only the loader while /stats is still in flight', async () => {
    serveAllButStats();
    render(<Dock />, { wrapper });

    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    // Entries have answered, but Today does not paint without its figure.
    await new Promise((done) => setTimeout(done, 50));
    expect(screen.queryByText('Writing')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Inbox' }),
    ).not.toBeInTheDocument();
  });
});
