import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, light, phone } from '@/mocks/screen';
import { NOT_INVITED } from '@/mocks/supabase';
import { SignInForm } from './signin-form';

/** Signed out: no frame, one field, a link by email. */
const meta = {
  title: 'Screens/SignIn',
  component: SignInForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/signin' } },
  },
} satisfies Meta<typeof SignInForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A normal visit: no error banner. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await page.findByLabelText('Email');
    await expect(page.queryByRole('alert')).toBeNull();
  },
};
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A link that failed at the callback. */
export const LinkFailed: Story = { ...desktop, args: { error: 'auth' } };

/** A link another tab's request replaced: it says so, rather than looking
    like a dead link. */
export const InvalidLink: Story = {
  ...desktop,
  args: { error: 'invalid_link' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('alert')).toHaveTextContent(
      /another tab started a different/i,
    );
  },
};

/** Where deleting an account lands. */
export const Deleted: Story = { ...desktop, args: { deleted: true } };

/** An email nobody invited: it says how to get in. */
export const NotInvited: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(await page.findByLabelText('Email'), NOT_INVITED);
    await userEvent.click(page.getByRole('button', { name: /Email me/ }));
    await expect(await page.findByRole('alert')).toHaveTextContent(
      'Stint is invite-only. Ask Blake for an invite.',
    );
  },
};
