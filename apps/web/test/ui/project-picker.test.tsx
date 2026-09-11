import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectPicker } from '@/components/project-picker';
import type { Project } from '@/lib/client/api';

const PROJECTS = [
  { id: 'p1', name: 'Acme Redesign', color: '#DA8188' },
  { id: 'p2', name: 'Bluebird API', color: '#42B59A' },
  { id: 'p3', name: 'Corvus Dashboard', color: '#6EA1E2' },
] as unknown as Project[];

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Project' }));
  return user;
}

/**
 * These cover what the previous hand-rolled listbox silently lacked. Each
 * assertion here corresponds to a real gap, not to Radix's own test suite:
 * the point is that the picker keeps using a primitive that provides them.
 */
describe('ProjectPicker', () => {
  it('lists every project plus an explicit "No project" choice', async () => {
    render(<ProjectPicker projects={PROJECTS} value={null} onChange={() => {}} />);
    await open();

    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('No project');
    expect(items[3]).toHaveTextContent('Corvus Dashboard');
  });

  it('marks the selected project checked, not merely styled', async () => {
    render(<ProjectPicker projects={PROJECTS} value="p2" onChange={() => {}} />);
    await open();

    expect(screen.getByRole('menuitemradio', { name: /Bluebird API/ })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: /Acme/ })).not.toBeChecked();
  });

  it('moves between items with the arrow keys', async () => {
    render(<ProjectPicker projects={PROJECTS} value={null} onChange={() => {}} />);
    const user = await open();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'No project' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Acme/ })).toHaveFocus();
  });

  it('jumps to a project by typing its first letter', async () => {
    render(<ProjectPicker projects={PROJECTS} value={null} onChange={() => {}} />);
    const user = await open();

    await user.keyboard('c');
    expect(screen.getByRole('menuitemradio', { name: /Corvus/ })).toHaveFocus();
  });

  it('reports the project id on select and null for "No project"', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProjectPicker projects={PROJECTS} value={null} onChange={onChange} />,
    );

    let user = await open();
    await user.click(screen.getByRole('menuitemradio', { name: /Corvus/ }));
    expect(onChange).toHaveBeenCalledWith('p3');

    rerender(<ProjectPicker projects={PROJECTS} value="p3" onChange={onChange} />);
    user = await open();
    await user.click(screen.getByRole('menuitemradio', { name: 'No project' }));
    // null, not the sentinel the radio group uses internally.
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('returns focus to the trigger after choosing', async () => {
    render(<ProjectPicker projects={PROJECTS} value={null} onChange={() => {}} />);
    const user = await open();

    await user.click(screen.getByRole('menuitemradio', { name: /Acme/ }));
    expect(screen.getByRole('button', { name: 'Project' })).toHaveFocus();
  });

  it('closes on Escape without selecting anything', async () => {
    const onChange = vi.fn();
    render(<ProjectPicker projects={PROJECTS} value={null} onChange={onChange} />);
    const user = await open();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when there are no projects rather than showing an empty menu', async () => {
    render(<ProjectPicker projects={[]} value={null} onChange={() => {}} />);
    await open();

    expect(screen.getByText('No projects yet.')).toBeInTheDocument();
  });
});
