import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { account, getDb } from '@/mocks/db';
import {
  desktop,
  expectOpen,
  failing,
  phone,
  screen,
  stalled,
} from '@/mocks/screen';
import { Home } from './home';

/** A first sign-in: Home with the welcome dialog over it. */
const meta = {
  title: 'Screens/Welcome',
  component: Home,
  ...screen('/'),
  parameters: { ...screen('/').parameters, ...account('new') },
} satisfies Meta<typeof Home>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = (el: HTMLElement) => within(el.ownerDocument.body);

async function toStep2(el: HTMLElement) {
  await expectOpen(el, 'dialog', 'Welcome to Stint');
  const page = body(el);
  await userEvent.type(
    await page.findByRole('spinbutton', { name: 'Default hourly rate' }),
    '125',
  );
  await userEvent.click(page.getByRole('button', { name: 'Next' }));
  return page.findByRole('textbox', { name: 'Client name' });
}

/** Step 1, nothing typed: Next waits for a rate. */
export const RateEmpty: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await expectOpen(canvasElement, 'dialog', 'Welcome to Stint');
    await expect(
      body(canvasElement).getByRole('button', { name: 'Next' }),
    ).toBeDisabled();
  },
};

export const RateEmptyPhone: Story = { ...phone, play: RateEmpty.play };

/** Step 1 with a rate: Next is ready. */
export const RateFilled: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await expectOpen(canvasElement, 'dialog', 'Welcome to Stint');
    const page = body(canvasElement);
    await userEvent.type(
      await page.findByRole('spinbutton', { name: 'Default hourly rate' }),
      '125',
    );
    await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  },
};

/** Next saves the rate at once and moves on, so a closed tab keeps it. */
export const NextSavesRate: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await toStep2(canvasElement);
    await expect(body(canvasElement).getByText('Step 2 of 2')).toBeVisible();
    await waitFor(() => expect(getDb().settings.defaultHourlyRate).toBe(125));
  },
};

/** Step 2, no name: it can be skipped, and the rate field shows the default. */
export const ClientEmpty: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await toStep2(canvasElement);
    const page = body(canvasElement);
    await expect(
      page.getByRole('spinbutton', { name: 'Rate' }),
    ).toHaveAttribute('placeholder', '125.00');
    await expect(
      page.getByRole('button', { name: 'Skip this step' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Start tracking' }),
    ).toBeDisabled();
  },
};

/** Step 2 filled: Skip gives way, and Start tracking is ready. */
export const ClientFilled: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const name = await toStep2(canvasElement);
    const page = body(canvasElement);
    await userEvent.type(name, 'Northwind Trading');
    await userEvent.type(page.getByRole('spinbutton', { name: 'Rate' }), '140');
    await expect(
      page.queryByRole('button', { name: 'Skip this step' }),
    ).toBeNull();
    await expect(
      page.getByRole('button', { name: 'Start tracking' }),
    ).toBeEnabled();
  },
};

/** Start tracking saves the client and closes the dialog. */
export const StartTracking: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await userEvent.type(await toStep2(canvasElement), 'Northwind Trading');
    const page = body(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Start tracking' }));
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(getDb().clients.map((c) => c.name)).toContain(
      'Northwind Trading',
    );
    await expect(getDb().settings.welcomedAt).not.toBeNull();
  },
};

/** The client is still saving: the button says so and the fields hold. */
export const Saving: Story = {
  ...desktop,
  parameters: stalled('createClient'),
  play: async ({ canvasElement }) => {
    await userEvent.type(await toStep2(canvasElement), 'Northwind Trading');
    const page = body(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Start tracking' }));
    await expect(
      await page.findByRole('button', { name: 'Saving' }),
    ).toBeDisabled();
  },
};

/** The client is refused: the dialog stays with what was typed, and why. */
export const Failed: Story = {
  ...desktop,
  parameters: failing('createClient'),
  play: async ({ canvasElement }) => {
    await userEvent.type(await toStep2(canvasElement), 'Northwind Trading');
    const page = body(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Start tracking' }));
    await expect(await page.findByText('Internal server error')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Client name' }),
    ).toHaveValue('Northwind Trading');
  },
};

/** "Skip for now" closes it with nothing saved, and it does not come back. */
export const SkipForNow: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await userEvent.click(
      await page.findByRole('button', { name: 'Skip for now' }),
    );
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await expect(getDb().settings.defaultHourlyRate).toBeNull();
    await waitFor(() => expect(getDb().settings.welcomedAt).not.toBeNull());
  },
};

/** The Toggl link marks the account welcomed on its way to the import. */
export const TogglImport: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await toStep2(canvasElement);
    await userEvent.click(
      body(canvasElement).getByRole('link', { name: 'Import your history' }),
    );
    await waitFor(() => expect(getDb().settings.welcomedAt).not.toBeNull());
  },
};

/** An account already welcomed sees Home and nothing over it. */
export const Welcomed: Story = {
  ...desktop,
  parameters: account('seeded'),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Unbilled');
    await expect(body(canvasElement).queryByRole('dialog')).toBeNull();
  },
};
