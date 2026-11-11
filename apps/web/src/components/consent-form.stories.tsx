import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, phone, stalled } from '@/mocks/screen';
import { ConsentForm } from './consent-form';

/** Approving an app such as Claude Code: no frame, as sign-in has none. */
const meta = {
  title: 'Screens/Consent',
  component: ConsentForm,
  args: {
    authorizationId: 'abc123',
    app: 'Claude Code',
    email: 'dev@localhost.test',
  },
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/oauth/consent' } },
  },
} satisfies Meta<typeof ConsentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Names the app and what it can do; Approve pends until Supabase answers. */
export const Desktop: Story = {
  ...desktop,
  parameters: stalled('oauth'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(
      await page.findByRole('heading', { name: 'Connect Claude Code?' }),
    ).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Approve' }));
    await expect(
      page.getByRole('button', { name: 'Approving…' }),
    ).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Deny' })).toBeDisabled();
  },
};
export const Phone: Story = { ...phone };

/** Approved: the callback may not leave the page, so it says it's done. */
export const Approved: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Approve' }));
    await expect(
      await page.findByText('Connected. You can close this tab.'),
    ).toBeVisible();
    await expect(page.queryByRole('button')).toBeNull();
  },
};

/** Denied: done the same way, saying nothing was connected. */
export const Denied: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Deny' }));
    await expect(
      await page.findByText('Not connected. You can close this tab.'),
    ).toBeVisible();
    await expect(page.queryByRole('button')).toBeNull();
  },
};

/** An expired or unknown link says so, and offers nothing to press. */
export const UnusableLink: Story = {
  ...desktop,
  args: { app: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('alert')).toHaveTextContent(
      /can’t be used/,
    );
    await expect(page.queryByRole('button')).toBeNull();
  },
};
