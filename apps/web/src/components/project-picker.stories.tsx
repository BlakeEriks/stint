import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ids, seed } from '@/mocks/fixtures';
import { expectOpen, menuOpen } from '@/mocks/screen';
import { NOW } from '@/mocks/time.mts';
import { ProjectPicker } from './project-picker';

const projects = seed(new Date(NOW)).projects.filter((p) => !p.archivedAt);

/** The label is the project; the color is its client's. `tag` rides the
    timer bar, `field` sits among a dialog's inputs. */
const meta = {
  title: 'Primitives/ProjectPicker',
  component: ProjectPicker,
  args: { projects, value: ids.warehouse, onChange: () => {} },
} satisfies Meta<typeof ProjectPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tag: Story = {};
export const TagUnset: Story = { args: { value: null } };
export const Field: Story = { args: { trigger: 'field' } };

/** Grouped by client, internal work last, and a way to add one. */
export const Open: Story = {
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await expectOpen(canvasElement, 'menu');
  },
};

/** No projects yet: the menu says so, and still offers to add one where it
    is needed most. */
export const OpenEmpty: Story = {
  args: { projects: [], value: null },
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
    await expectOpen(canvasElement, 'menu');
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByText('No projects yet.')).toBeVisible();
    // The plus is an aria-hidden icon, so it is no part of the name.
    await expect(
      page.getByRole('menuitem', { name: 'New project' }),
    ).toBeVisible();
  },
};
