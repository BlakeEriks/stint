import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { desktop, knownFailures, light, phone } from '@/mocks/screen';
import { SignInForm } from './signin-form';

/** Signed out: no frame, one field, a link by email. */
const meta = {
  title: 'Screens/SignIn',
  component: SignInForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/signin' } },
    a11y: knownFailures,
  },
} satisfies Meta<typeof SignInForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { ...desktop };
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A link that failed at the callback. */
export const LinkFailed: Story = { ...desktop, args: { error: 'auth' } };

/** Where deleting an account lands. */
export const Deleted: Story = { ...desktop, args: { deleted: true } };
