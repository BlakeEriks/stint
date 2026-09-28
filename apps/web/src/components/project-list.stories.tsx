import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
import {
  at,
  desktop,
  failing,
  light,
  menuOpen,
  phone,
  screen,
  expectOpen,
} from '@/mocks/screen';
import { ProjectList } from './project-list';

const meta = {
  title: 'Screens/Projects',
  component: ProjectList,
  ...screen('/projects'),
} satisfies Meta<typeof ProjectList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Grouped by client, each row its resolved rate; "No client" last. */
export const Desktop: Story = { ...desktop };
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** An archived client keeps its heading, badged. */
export const Archived: Story = {
  ...desktop,
  parameters: at('/projects', { status: 'archived' }),
};
export const All: Story = {
  ...desktop,
  parameters: at('/projects', { status: 'all' }),
};

/** No rate anywhere in the chain: the row says invoicing will refuse it. */
export const NoRate: Story = {
  ...desktop,
  parameters: account((db) => {
    db.settings.defaultHourlyRate = null;
  }),
};

export const Empty: Story = { ...desktop, parameters: account('empty') };
export const Failed: Story = { ...desktop, parameters: failing('projects') };

export const NewProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [add] = await page.findAllByRole('button', { name: /Add project/ });
    await userEvent.click(add as HTMLElement);
    await expectOpen(canvasElement, 'dialog');
  },
};

/** A project's client can be created on the way, in a dialog of its own. */
export const NewProjectNewClient: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [add] = await page.findAllByRole('button', { name: /Add project/ });
    await userEvent.click(add as HTMLElement);
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitem', { name: /Add a client/ }),
    );
    await expectOpen(canvasElement, 'dialog', 'New client');
  },
};
