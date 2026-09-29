import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { account } from '@/mocks/db';
import { id, ids } from '@/mocks/fixtures';
import {
  at,
  desktop,
  expectOpen,
  failing,
  light,
  menuOpen,
  phone,
  screen,
} from '@/mocks/screen';
import { ClientList } from './client-list';

const meta = {
  title: 'Screens/Clients',
  component: ClientList,
  ...screen('/clients'),
} satisfies Meta<typeof ClientList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each client a heading, with its rate and summary line, its projects
    beneath at their resolved rates; "No client" last. */
export const Desktop: Story = { ...desktop };
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A client with no projects keeps its heading: this is the only list of
    clients. */
export const ClientWithoutProjects: Story = {
  ...desktop,
  parameters: account((db) => {
    db.projects = db.projects.filter((p) => p.clientId !== ids.byrne);
  }),
};

/** Only work with no client: the "No client" group alone. */
export const OnlyClientless: Story = {
  ...desktop,
  parameters: account((db) => {
    db.clients = [];
    db.projects = db.projects.filter((p) => p.clientId === null);
  }),
};

/** No rate anywhere in the chain: the row says invoicing will refuse it. */
export const NoRate: Story = {
  ...desktop,
  parameters: account((db) => {
    db.settings.defaultHourlyRate = null;
  }),
};

/** An archived client with all its projects, badged; an active client's
    archived project sits under that client, which carries no badge. */
export const Archived: Story = {
  ...desktop,
  parameters: {
    ...at('/clients', { status: 'archived' }),
    ...account((db) => {
      const warehouse = db.projects.find((p) => p.id === ids.warehouse)!;
      warehouse.archivedAt = '2026-06-30T16:00:00.000Z';
      // Active itself, but its client is archived, so it shows here too.
      db.projects.push({
        ...warehouse,
        id: id(207),
        name: 'Final handover',
        clientId: ids.oldEngagement,
        archivedAt: null,
      });
    }),
  },
};
export const All: Story = {
  ...desktop,
  parameters: at('/clients', { status: 'all' }),
};

/** An archived client's active project counts as archived: under Active,
    neither shows. */
export const ArchivedClientActiveProject: Story = {
  ...desktop,
  parameters: account((db) => {
    const legacy = db.projects.find((p) => p.id === ids.legacy)!;
    legacy.archivedAt = null;
  }),
};

export const Empty: Story = { ...desktop, parameters: account('empty') };
export const Failed: Story = {
  ...desktop,
  parameters: failing('clients', 'projects'),
};

/** A project is added from its client's card, with that client chosen. */
export const NewProjectForClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', {
        name: 'Project for Northwind Trading',
      }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};

/** A project's client can be created on the way, in a dialog of its own. */
export const NewProjectNewClient: Story = {
  ...desktop,
  parameters: menuOpen,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Project with no client' }),
    );
    await userEvent.click(await page.findByRole('button', { name: 'Client' }));
    await userEvent.click(
      await page.findByRole('menuitem', { name: /Add a client/ }),
    );
    await expectOpen(canvasElement, 'dialog', 'New client');
  },
};

/** Edit opens the project's dialog, which also archives it. */
export const EditProject: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Warehouse dashboard' }),
    );
    await expectOpen(canvasElement, 'dialog');
  },
};

/** A client edits in a dialog too, never a page, with Archive client. */
export const EditClient: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Edit Northwind Trading' }),
    );
    await expectOpen(canvasElement, 'dialog', 'Edit client');
  },
};
