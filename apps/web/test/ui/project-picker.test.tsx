import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProjectPicker } from '@/components/project-picker';
import type { Project } from '@/lib/client/api';

const PROJECTS = [
  { id: 'p1', name: 'Acme Redesign' },
  { id: 'p2', name: 'Bluebird API' },
  { id: 'p3', name: 'Corvus Dashboard' },
] as unknown as Project[];

/** The picker hosts the new-project dialog, which reads the client list. */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Project/ }));
  return user;
}

/**
 * These cover what the previous hand-rolled listbox silently lacked. Each
 * assertion here corresponds to a real gap, not to Radix's own test suite:
 * the point is that the picker keeps using a primitive that provides them.
 */
describe('ProjectPicker', () => {
  it('marks the selected project checked, not merely styled', async () => {
    render(
      <ProjectPicker projects={PROJECTS} value="p2" onChange={() => {}} />,
      { wrapper },
    );
    await open();

    expect(
      screen.getByRole('menuitemradio', { name: /Bluebird API/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemradio', { name: /Acme/ }),
    ).not.toBeChecked();
  });

  it('moves between items with the arrow keys, and jumps by first letter', async () => {
    render(
      <ProjectPicker projects={PROJECTS} value={null} onChange={() => {}} />,
      { wrapper },
    );
    const user = await open();

    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitemradio', { name: 'No project' }),
    ).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Acme/ })).toHaveFocus();

    await user.keyboard('c');
    expect(screen.getByRole('menuitemradio', { name: /Corvus/ })).toHaveFocus();
  });

  it('reports the project id on select, returns focus to the trigger, and null for "No project"', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProjectPicker projects={PROJECTS} value={null} onChange={onChange} />,
      { wrapper },
    );

    let user = await open();
    await user.click(screen.getByRole('menuitemradio', { name: /Corvus/ }));
    expect(onChange).toHaveBeenCalledWith('p3');
    expect(screen.getByRole('button', { name: 'Project' })).toHaveFocus();

    rerender(
      <ProjectPicker projects={PROJECTS} value="p3" onChange={onChange} />,
    );
    user = await open();
    await user.click(screen.getByRole('menuitemradio', { name: 'No project' }));
    // null, not the sentinel the radio group uses internally.
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
