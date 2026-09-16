import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskSuggest } from '@/components/task-suggest';

const NAMES = [
  { taskName: 'Invoice reconciliation', projectId: 'p1', lastUsedAt: '1' },
  { taskName: 'Onboarding call', projectId: 'p1', lastUsedAt: '2' },
  { taskName: 'Billing review', projectId: 'p2', lastUsedAt: '3' },
  { taskName: 'Sprint planning', projectId: null, lastUsedAt: '4' },
  { taskName: 'Standup', projectId: 'p1', lastUsedAt: '5' },
];

/** The component reads task names, projects and clients. */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url);
      const body = path.includes('task-names')
        ? { taskNames: NAMES }
        : path.includes('/projects')
          ? { projects: [{ id: 'p1', name: 'Ledger', clientId: 'c1' }] }
          : { clients: [{ id: 'c1', name: 'Northwind', color: '#8ab4f8' }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * A host that owns the value the way the timer bar and the dialog do, plus an
 * `onSubmit` standing in for their own Enter handler — the thing that must
 * stay free to run when nothing is highlighted.
 */
function Host({
  onChosen,
  onSubmit,
}: {
  onChosen?: (name: string, projectId: string | null) => void;
  onSubmit?: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <TaskSuggest
      value={value}
      projectId="p1"
      onChange={(name, projectId) => {
        setValue(name);
        onChosen?.(name, projectId);
      }}
    >
      {(props) => (
        <input
          {...props}
          aria-label="Task name"
          onKeyDown={(e) => {
            props.onKeyDown(e);
            if (e.key === 'Enter' && !e.defaultPrevented) onSubmit?.();
          }}
        />
      )}
    </TaskSuggest>
  );
}

async function focusField() {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Task name'));
  await screen.findByRole('listbox');
  return user;
}

describe('TaskSuggest', () => {
  it('filters the list as characters arrive', async () => {
    stubFetch();
    render(<Host />, { wrapper });
    const user = await focusField();

    // Focus alone opens it, capped at four rows.
    expect(screen.getAllByRole('option')).toHaveLength(4);

    // "Bill" matches one name out of five, so a list that did not filter
    // would still be showing its four.
    await user.keyboard('Bill');
    const names = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Billing review');
  });

  /**
   * The rule the whole design turns on: the list opens with no selection, so
   * Enter still means what it meant before the list existed.
   */
  it('leaves Enter to the caller when nothing is highlighted', async () => {
    stubFetch();
    const onChosen = vi.fn();
    const onSubmit = vi.fn();
    render(<Host onChosen={onChosen} onSubmit={onSubmit} />, { wrapper });
    const user = await focusField();

    await user.keyboard('in');
    onChosen.mockClear();

    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // The field keeps exactly what was typed.
    expect(screen.getByLabelText('Task name')).toHaveValue('in');
    expect(onChosen).not.toHaveBeenCalled();
  });

  it('fills the field and reports the row project on Down then Enter', async () => {
    stubFetch();
    const onChosen = vi.fn();
    const onSubmit = vi.fn();
    render(<Host onChosen={onChosen} onSubmit={onSubmit} />, { wrapper });
    const user = await focusField();

    await user.keyboard('Bill');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onChosen).toHaveBeenCalledWith('Billing review', 'p2');
    expect(screen.getByLabelText('Task name')).toHaveValue('Billing review');
    // Accepting a suggestion is not submitting the field.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps focus in the field when a row is clicked', async () => {
    stubFetch();
    const onChosen = vi.fn();
    render(<Host onChosen={onChosen} />, { wrapper });
    const user = await focusField();

    await user.click(screen.getByRole('option', { name: /Sprint planning/ }));

    expect(screen.getByLabelText('Task name')).toHaveFocus();
    expect(onChosen).toHaveBeenCalledWith('Sprint planning', null);
  });

  it('closes on Escape and keeps what was typed', async () => {
    stubFetch();
    render(<Host />, { wrapper });
    const user = await focusField();

    await user.keyboard('in');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Task name')).toHaveValue('in');
  });

  it('shows the keycap on the highlighted row only', async () => {
    stubFetch();
    render(<Host />, { wrapper });
    const user = await focusField();

    // Nothing highlighted on open, so no key is claimed to work.
    expect(document.querySelectorAll('kbd')).toHaveLength(0);

    await user.keyboard('{ArrowDown}');
    const caps = document.querySelectorAll('kbd');
    expect(caps).toHaveLength(1);

    const options = screen.getAllByRole('option');
    expect(options[0]).toContainElement(caps[0] as HTMLElement);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('names the highlighted row as the active descendant, and only then', async () => {
    stubFetch();
    render(<Host />, { wrapper });
    const user = await focusField();
    const field = screen.getByLabelText('Task name');

    expect(field).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    const first = screen.getAllByRole('option')[0] as HTMLElement;
    expect(field).toHaveAttribute('aria-activedescendant', first.id);

    // Up past the first row leaves the list.
    await user.keyboard('{ArrowUp}');
    expect(field).not.toHaveAttribute('aria-activedescendant');
  });

  it('renders nothing when no name matches', async () => {
    stubFetch();
    render(<Host />, { wrapper });
    const user = await focusField();

    await user.keyboard('zzzz');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('leaves Enter to the caller when the highlight came from hover', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    render(<Host onSubmit={onSubmit} />, { wrapper });
    const user = await focusField();

    await user.keyboard('Invoice');
    // The list opens over the pointer, so a row lands under a motionless
    // cursor. Hovering is not choosing.
    await user.hover(screen.getAllByRole('option')[0] as HTMLElement);
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Task name')).toHaveValue('Invoice');
  });

  it('does not call a row from an archived project internal', async () => {
    stubFetch();
    render(<Host />, { wrapper });
    const user = await focusField();

    await user.keyboard('Billing');
    // `p2` is absent from /projects, which excludes archived ones. The row
    // still carries a client whose rate bills it.
    const row = screen.getAllByRole('option')[0] as HTMLElement;
    expect(row).not.toHaveTextContent('Internal');
  });
});
