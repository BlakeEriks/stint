import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, phone } from '@/mocks/screen';
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

/** Names the app and what it can do; Approve waits on the page leaving. */
export const Desktop: Story = {
  ...desktop,
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
