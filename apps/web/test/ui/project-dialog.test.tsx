import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProjectDialog } from '@/components/project-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Returns the requests made, so a test can assert what was sent. */
function serve(initial: { id: string; name: string }[]) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  /* A real server returns the new client on the next GET. Keeping the stub
     static would make the "is it selected?" assertion unfalsifiable — the
     option could never exist, so an empty select would look like correct
     behaviour. */
  const clients = [...initial];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = String(url).replace('/api/v1', '');
      if (method !== 'GET') {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method, path, body });
        const created = { id: 'new-id', ...(body as object) };
        if (path === '/clients') {
          clients.push(created as { id: string; name: string });
        }
        return new Response(JSON.stringify(created), { status: 200 });
      }
      if (path.startsWith('/clients')) {
        return new Response(JSON.stringify({ clients }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('ProjectDialog', () => {
  it('offers to create a client even when the account has none', async () => {
    /* THE dead end this closes: on a new account the select offered only "No
       client" and nothing else, so a first project could not be attached to
       anything without leaving the screen — abandoning whatever had been
       typed into the timer. */
    serve([]);
    render(<ProjectDialog open onOpenChange={() => {}} />, { wrapper });

    const select = await screen.findByLabelText('Client');
    const labels = [...select.querySelectorAll('option')].map((o) =>
      o.textContent?.trim(),
    );
    expect(labels).toContain('+ Add a client…');
    // And the internal-work path is still the first choice, not displaced.
    expect(labels[0]).toBe('No client — internal work');
  });

  it('creates a client inline and selects it for the project', async () => {
    const calls = serve([]);
    const user = userEvent.setup();
    render(<ProjectDialog open onOpenChange={() => {}} />, { wrapper });

    await user.type(await screen.findByLabelText('Name'), 'Website redesign');
    await user.selectOptions(screen.getByLabelText('Client'), '__new_client__');

    // The client form replaces the project form — one dialog, not two
    // overlays and two focus traps competing.
    /* Both forms have a field labelled "Name", so this asserts on the
       client form's own control rather than whichever matched first. */
    await user.type(await screen.findByLabelText(/^Name/), 'Northwind');
    await user.click(screen.getByRole('button', { name: 'Add client' }));

    /* The FIRST render back on the project form must already carry the
       selection. Polling for it with waitFor would also pass if the select
       were briefly blank — which is exactly the bug: a user returning to an
       empty Client field having just created one. */
    const back = await screen.findByLabelText('Client');
    expect((back as HTMLSelectElement).value).toBe('new-id');

    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/clients',
      body: { name: 'Northwind' },
    });

    /* Back on the project form with the new client chosen — the whole point
       of creating one from here. Having to reopen a menu and find it would
       make this no better than leaving for /clients. */
    expect((screen.getByLabelText('Client') as HTMLSelectElement).value).toBe(
      'new-id',
    );

    // And the project fields survived the detour.
    expect(screen.getByLabelText('Name')).toHaveValue('Website redesign');
  });

  it('keeps the project when a client is abandoned', async () => {
    const calls = serve([]);
    const user = userEvent.setup();
    render(<ProjectDialog open onOpenChange={() => {}} />, { wrapper });

    await user.type(await screen.findByLabelText('Name'), 'Internal tooling');
    await user.selectOptions(screen.getByLabelText('Client'), '__new_client__');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    /* Cancelling the detour must abandon only the client. Closing the whole
       dialog would lose the project the user was part-way through, which is
       the thing the dialog exists to avoid. */
    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveValue('Internal tooling'),
    );
    expect(calls).toEqual([]);
    expect((screen.getByLabelText('Client') as HTMLSelectElement).value).toBe(
      '',
    );
  });
});
