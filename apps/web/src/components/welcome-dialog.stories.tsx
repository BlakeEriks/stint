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

/** Step 1, nothing typed: Next says the rate is missing, at its field. */
export const RateEmpty: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await expectOpen(canvasElement, 'dialog', 'Welcome to Stint');
    const page = body(canvasElement);
    await userEvent.click(page.getByRole('button', { name: 'Next' }));
    const rate = page.getByRole('spinbutton', { name: 'Default hourly rate' });
    await expect(rate).toHaveAccessibleDescription(/^Enter your rate/);
    await expect(rate).toHaveFocus();
    await expect(page.getByText('Step 1 of 2')).toBeVisible();
  },
};

export const RateEmptyPhone: Story = { ...phone, play: RateEmpty.play };

/** Next saves the rate at once and moves on, so a closed tab keeps it. */
export const NextSavesRate: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await toStep2(canvasElement);
    await expect(body(canvasElement).getByText('Step 2 of 2')).toBeVisible();
    await waitFor(() => expect(getDb().settings.defaultHourlyRate).toBe(125));
  },
};

/** What a field's text box has to spare once it holds its placeholder and
    the browser's number spinner, which sits inside it (Chrome's is 15px). */
function placeholderSlack(input: HTMLInputElement) {
  const style = getComputedStyle(input);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // offsetWidth, not clientWidth: Chromium 1.65's clientWidth on an input
  // already leaves out the padding.
  const box =
    input.offsetWidth -
    Number.parseFloat(style.borderLeftWidth) -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight) -
    Number.parseFloat(style.borderRightWidth);
  return box - 15 - ctx.measureText(input.placeholder).width;
}

/** Step 2, no name: it can be skipped, the rate field shows the default
    whole, beside its spinner, and Start tracking says the name is missing. */
export const ClientEmpty: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    await toStep2(canvasElement);
    const page = body(canvasElement);
    const rate = page.getByRole('spinbutton', { name: 'Rate' });
    await expect(rate).toHaveAttribute('placeholder', '125.00');
    await expect(
      placeholderSlack(rate as HTMLInputElement),
    ).toBeGreaterThanOrEqual(0);
    await expect(
      page.getByRole('button', { name: 'Skip this step' }),
    ).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Start tracking' }));
    const name = page.getByRole('textbox', { name: 'Client name' });
    await expect(name).toHaveAccessibleDescription(/^Name the client/);
    await expect(name).toHaveFocus();
  },
};

/** Step 2 filled: Skip gives way to Start tracking. */
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
    // The dialog closes on the prediction; the stamp lands after.
    await waitFor(() => expect(getDb().settings.welcomedAt).not.toBeNull());
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
    await expect(
      await page.findByText('Request failed. Tracked time is unaffected.'),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Client name' }),
    ).toHaveValue('Northwind Trading');
  },
};

/** "Skip for now" closes it with no rate saved, and it does not come back.
    Like every way out, it bills the account in the zone it was created in. */
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
    await expect(getDb().settings.billingTimeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
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
