import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EntryDialog } from '@/components/entry-dialog';
import type { Project, TimeEntry } from '@/lib/client/api';

const PROJECTS = [
  { id: 'p1', name: 'Acme Redesign', clientId: 'c1' },
] as unknown as Project[];

const TZ = 'America/New_York';

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e1',
    taskName: 'Writing',
    projectId: null,
    // 09:00–10:30 in New York.
    startedAt: '2026-09-11T13:00:00.000Z',
    endedAt: '2026-09-11T14:30:00.000Z',
    isBillable: true,
    invoiceId: null,
    durationSeconds: 5400,
    ...over,
  } as TimeEntry;
}

/**
 * Records what the server was asked to do — the part a user would feel.
 *
 * `invoiceStatus` answers the ONE read the dialog makes beyond the entry
 * itself. It matters that this is a real answer rather than a catch-all: the
 * lock depends on it, and a stub that returned the entry for every path left
 * the status undefined, so the locked assertion passed without ever
 * exercising the rule it claims to test.
 */
function serve(invoiceStatus: string = 'sent') {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url).replace('/api/v1', '');
      calls.push({
        method: init?.method ?? 'GET',
        path,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (path.startsWith('/invoices/')) {
        return new Response(JSON.stringify({ status: invoiceStatus }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(entry()), { status: 200 });
    }),
  );
  return calls;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const open = (existing?: TimeEntry) =>
  render(
    <EntryDialog
      open
      onOpenChange={() => {}}
      existing={existing}
      projects={PROJECTS}
      tz={TZ}
    />,
    { wrapper },
  );

afterEach(() => vi.unstubAllGlobals());

describe('EntryDialog', () => {
  it('shows the stored instant as local wall-clock time', async () => {
    serve();
    open(entry());

    /* 13:00Z is 09:00 in New York. Showing UTC here would silently move every
       entry by the offset, which in a billing tool means wrong hours on an
       invoice. */
    await waitFor(() =>
      expect(screen.getByLabelText('Start')).toHaveValue('09:00'),
    );
    expect(screen.getByLabelText('End')).toHaveValue('10:30');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-11');
  });

  it('sends an edit back as an instant, not wall-clock', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open(entry());

    await waitFor(() => screen.getByLabelText('End'));
    await user.clear(screen.getByLabelText('End'));
    await user.type(screen.getByLabelText('End'), '11:45');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/entries/e1');
    // 11:45 in New York is 15:45Z.
    expect((patch.body as { endedAt: string }).endedAt).toBe(
      '2026-09-11T15:45:00.000Z',
    );
  });

  it('treats an end before the start as overnight rather than an error', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open(entry());

    await waitFor(() => screen.getByLabelText('Start'));
    await user.clear(screen.getByLabelText('Start'));
    await user.type(screen.getByLabelText('Start'), '22:00');
    await user.clear(screen.getByLabelText('End'));
    await user.type(screen.getByLabelText('End'), '02:00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const body = calls.find((c) => c.method === 'PATCH')!.body as {
      startedAt: string;
      endedAt: string;
    };

    /* A shift from 22:00 to 02:00 is four hours, not a typo. Rejecting it
       would be technically defensible and useless to someone who actually
       worked those hours. */
    const hours =
      (Date.parse(body.endedAt) - Date.parse(body.startedAt)) / 3_600_000;
    expect(hours).toBe(4);
  });

  it('never offers an edit on an entry billed to an issued invoice', async () => {
    serve('sent');
    open(entry({ invoiceId: 'inv1' }));

    /* The lock is a database trigger, so an edit here would 409. Showing the
       reason is honest; offering a save that cannot succeed is not. */
    await waitFor(() => expect(screen.getByLabelText('Task')).toBeDisabled());
    for (const field of ['Project', 'Date', 'Start', 'End']) {
      expect(screen.getByLabelText(field)).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    /* The footer button and the dialog's own X both read "Close". The point
       is not how many there are — it is that EVERY remaining action is a
       dismiss, so there is no way to attempt a write. */
    const actions = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim() || 'Close');
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(['Close']));
  });

  /* `guard_billed_entry` returns early on a draft, so the UI must not
     disable an edit the server would accept. */
  it('still allows editing an entry on a DRAFT invoice', async () => {
    serve('draft');
    open(entry({ invoiceId: 'inv1' }));

    await waitFor(() => expect(screen.getByLabelText('Task')).toBeEnabled());
    for (const field of ['Project', 'Date', 'Start', 'End']) {
      expect(screen.getByLabelText(field)).toBeEnabled();
    }
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  /* Editing a draft-billed entry changes what that draft would bill, and the
     preview the user approved is now stale. Saying so is the difference
     between an allowed edit and a silent one. */
  it('warns that a draft would need previewing again', async () => {
    serve('draft');
    open(entry({ invoiceId: 'inv1' }));

    expect(
      await screen.findByText(/draft invoice.*preview it again/i),
    ).toBeInTheDocument();
  });

  it('does not delete until the confirmation is clicked', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open(entry());

    await user.click(screen.getByRole('button', { name: /delete/i }));

    /* Deleting a logged entry is irreversible and the row is one click away
       from the duration, so the first click must only ask. */
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Delete for good' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
    );
  });

  it('creates with a client-generated id so a retry is idempotent', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open(); // no existing entry

    await user.type(screen.getByLabelText('Task'), 'Manual');
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.type(screen.getByLabelText('End'), '10:00');
    await user.click(screen.getByRole('button', { name: 'Add entry' }));

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const post = calls.find((c) => c.method === 'POST')!;
    const body = post.body as { id: string };

    /* A client-supplied UUIDv7 is what makes a retried insert land on the
       same row instead of duplicating the entry. */
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  /**
   * The inbox passes `useExit`'s `mark` here, and its row is only still in the
   * query data until the invalidation runs — so a refetch that starts before
   * `onSaved` settles tears the row out mid-animation. Ordering is the whole
   * contract; that the callback is merely CALLED proves nothing.
   */
  it('awaits onSaved before invalidating', async () => {
    serve();
    const user = userEvent.setup();
    const order: string[] = [];

    let release!: () => void;
    const saved = new Promise<void>((r) => {
      release = r;
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    client.invalidateQueries = (async () => {
      order.push('invalidate');
    }) as typeof client.invalidateQueries;

    render(
      <QueryClientProvider client={client}>
        <EntryDialog
          open
          onOpenChange={() => {}}
          existing={entry()}
          projects={PROJECTS}
          tz={TZ}
          onSaved={(id) => {
            order.push(`saved:${id}`);
            return saved;
          }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => screen.getByLabelText('End'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(order).toContain('saved:e1'));
    // Held open: nothing may refetch while the row is still animating.
    expect(order).toEqual(['saved:e1']);

    release();
    await waitFor(() => expect(order).toContain('invalidate'));
    expect(order[0]).toBe('saved:e1');
  });
});
