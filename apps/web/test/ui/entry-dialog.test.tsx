import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EntryDialog } from '@/components/entry-dialog';
import type { Project, TaskNameSuggestion, TimeEntry } from '@/lib/client/api';

const PROJECTS = [
  { id: 'p1', name: 'Acme Redesign', clientId: 'c1' },
  { id: 'p2', name: 'Bluebird API', clientId: 'c2' },
  { id: 'p3', name: 'Internal', clientId: null, isBillableDefault: false },
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
    invoicedElsewhere: false,
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
function serve(
  invoiceStatus: string = 'sent',
  taskNames: TaskNameSuggestion[] = [],
) {
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
      // Empty by default, so every test that predates the list sees none.
      if (path.startsWith('/entries/task-names')) {
        return new Response(JSON.stringify({ taskNames }), { status: 200 });
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

/** Adding opens on a drawn or clicked time: 09:00–10:00 in New York. */
const SEED = {
  startedAt: '2026-09-11T13:00:00.000Z',
  endedAt: '2026-09-11T14:00:00.000Z',
};

const open = (existing?: TimeEntry) =>
  render(
    <EntryDialog
      open
      onOpenChange={() => {}}
      {...(existing ? { existing } : { seed: SEED })}
      projects={PROJECTS}
      tz={TZ}
    />,
    { wrapper },
  );

const SUGGESTIONS: TaskNameSuggestion[] = [
  { taskName: 'Invoice reconciliation', projectId: 'p1', lastUsedAt: '1' },
];

afterEach(() => vi.unstubAllGlobals());

describe('EntryDialog', () => {
  it('sends billed elsewhere as ticked, unticked, or not at all when untouched', async () => {
    for (const [stored, press, sent] of [
      [false, true, { invoicedElsewhere: true }],
      [true, true, { invoicedElsewhere: false }],
      [false, false, undefined],
    ] as const) {
      const calls = serve();
      const user = userEvent.setup();
      const { unmount } = open(entry({ invoicedElsewhere: stored }));

      const box = await screen.findByRole('checkbox', {
        name: 'Billed elsewhere',
      });
      if (press) await user.click(box);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(calls.find((c) => c.method === 'PATCH')?.body).toBeDefined(),
      );
      const body = calls.find((c) => c.method === 'PATCH')?.body;
      if (sent) expect(body).toMatchObject(sent);
      else expect(body).not.toHaveProperty('invoicedElsewhere');
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('shows the stored instant as local wall-clock time, and sends an edit back as an instant', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open(entry());

    /* 13:00Z is 09:00 in New York. Showing UTC here would silently move every
       entry by the offset, which in a billing tool means wrong hours on an
       invoice. */
    await waitFor(() =>
      expect(screen.getByLabelText('Start')).toHaveValue('09:00'),
    );
    expect(screen.getByLabelText('End')).toHaveValue('10:30');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-11');

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
    const calls = serve('sent', SUGGESTIONS);
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
       dismiss, so there is no way to attempt a write.

       Disabled buttons are not remaining actions, and the project picker's
       trigger is one: it is a button rather than a `<select>`, and line 158
       is what proves it cannot be operated. */
    const actions = screen
      .getAllByRole('button')
      .filter((b) => !(b as HTMLButtonElement).disabled)
      .map((b) => b.textContent?.trim() || 'Close');
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions)).toEqual(new Set(['Close']));

    /* Nor a suggestion list: one over a read-only field offers an edit that
       409s. Asserted as the REQUEST, not the rendered list — a disabled
       input cannot be focused, so "no listbox" would hold whether or not the
       suggestion machinery was suppressed. */
    expect(calls.some((c) => c.path.startsWith('/entries/task-names'))).toBe(
      false,
    );
  });

  /* Radix mounts no dialog inside another, so the item would set its state
     and nothing would reach the DOM — a control that looks live and does
     nothing. Projects are created from the timer bar or `/projects`. */
  it('offers no New project inside the dialog', async () => {
    serve();
    const user = userEvent.setup();
    open(entry());

    await waitFor(() => expect(screen.getByLabelText('Task')).toBeEnabled());
    await user.click(screen.getByLabelText('Project'));

    // The menu is open and lists the projects, but not the create action.
    expect(
      await screen.findByRole('menuitemradio', { name: /Acme Redesign/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /New project/ })).toBeNull();
  });

  /* An entry that exists is already named, so there is nothing to
     accelerate and the overlay would drop over the field the moment it
     takes focus. Asserted as the REQUEST rather than the absent list: the
     list is also absent when nothing has been typed, so "no listbox" would
     pass whether or not the machinery was actually suppressed. What a
     chosen row may write is `timer-bar.test.tsx`'s "fills the field with a
     chosen name". */
  it('opens on the task by default, asking for no suggestions for an entry that exists', async () => {
    const calls = serve('sent', SUGGESTIONS);
    open(entry({ projectId: null }));

    await waitFor(() => expect(screen.getByLabelText('Task')).toHaveFocus());
    expect(calls.some((c) => c.path.startsWith('/entries/task-names'))).toBe(
      false,
    );
  });

  it('deletes only from the confirm, which takes focus and hands it back on Keep', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open(entry());

    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(screen.getByRole('button', { name: 'Delete entry' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Delete entry' })).toHaveFocus();

    /* Deleting a logged entry is irreversible and the row is one click away
       from the duration, so the first click must only ask. */
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
    );
  });

  it("shows the server's reason when a save is refused", async () => {
    serve();
    const user = userEvent.setup();
    open(entry());
    await waitFor(() => expect(screen.getByLabelText('Task')).toBeEnabled());

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'OVERLAP', message: 'Overlaps another entry.' }),
        { status: 409 },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Overlaps another entry.',
    );
  });

  it.each([
    ['Save', 'Couldn’t save this entry.'],
    ['Delete entry', 'Couldn’t delete this entry.'],
  ])(
    'falls back to its own words when %s fails offline',
    async (press, text) => {
      serve();
      const user = userEvent.setup();
      open(entry());
      await waitFor(() => expect(screen.getByLabelText('Task')).toBeEnabled());
      if (press !== 'Save') {
        await user.click(screen.getByRole('button', { name: 'Delete entry' }));
      }

      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
      await user.click(screen.getByRole('button', { name: press }));

      expect(await screen.findByRole('alert')).toHaveTextContent(text);
    },
  );

  it("a new entry takes its project's billable default, and a client-generated id", async () => {
    const calls = serve();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByLabelText('Project'));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /Internal/ }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Billable' }),
    ).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Add entry' }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toBeDefined(),
    );
    const post = calls.find((c) => c.method === 'POST')!;
    expect((post.body as { isBillable: boolean }).isBillable).toBe(false);
    /* A client-supplied UUIDv7 is what makes a retried insert land on the
       same row instead of duplicating the entry. */
    expect((post.body as { id: string }).id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('a project picked after Billable was unticked leaves it unticked', async () => {
    const calls = serve();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('checkbox', { name: 'Billable' }));
    await user.click(screen.getByLabelText('Project'));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /Acme Redesign/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Add entry' }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toBeDefined(),
    );
    const post = calls.find((c) => c.method === 'POST')!;
    expect((post.body as { isBillable: boolean }).isBillable).toBe(false);
  });

  it('moving an entry that exists keeps its billable flag', async () => {
    serve();
    const user = userEvent.setup();
    open(entry({ isBillable: true }));

    await waitFor(() => expect(screen.getByLabelText('Task')).toBeEnabled());
    await user.click(screen.getByLabelText('Project'));
    await user.click(
      await screen.findByRole('menuitemradio', { name: /Internal/ }),
    );
    expect(screen.getByRole('checkbox', { name: 'Billable' })).toBeChecked();
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

describe('adding an entry', () => {
  /* Predicted: the form closes on the press and the block stands in for
     the answer. */
  it('closes on the press, before the server answers', async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts.push(JSON.parse(String(init.body)));
          return new Promise<Response>(() => {});
        }
        return new Response(
          JSON.stringify(
            String(url).includes('task-names') ? { taskNames: [] } : {},
          ),
          { status: 200 },
        );
      }),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <EntryDialog
        open
        onOpenChange={onOpenChange}
        seed={{
          startedAt: '2026-09-11T13:00:00.000Z',
          endedAt: '2026-09-11T14:00:00.000Z',
        }}
        projects={PROJECTS}
        tz={TZ}
      />,
      { wrapper },
    );

    await user.type(screen.getByLabelText('Task'), 'Drawn');
    await user.click(screen.getByRole('button', { name: 'Add entry' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(posts).toHaveLength(1));
  });
});
