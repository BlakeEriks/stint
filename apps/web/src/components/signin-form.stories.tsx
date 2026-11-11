import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, light, phone } from '@/mocks/screen';
import { otp } from '@/mocks/supabase';
import { turnstile } from '@/mocks/turnstile';
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

/** Production asks for a CAPTCHA: the button waits for its token. */
export const Captcha: Story = {
  ...desktop,
  args: { captchaSiteKey: 'storybook' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const send = await page.findByRole('button', { name: /Email me/ });
    await expect(send).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: /not a bot/ }));
    await expect(send).toBeEnabled();
  },
};

/** GoTrue refused the token: it says so, and draws a new check. */
export const CaptchaFailed: Story = {
  ...desktop,
  args: { captchaSiteKey: 'storybook' },
  beforeEach: () => {
    otp.error = { code: 'captcha_failed', message: 'captcha protection' };
    return () => {
      otp.error = null;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(await page.findByLabelText('Email'), 'a@x.test');
    await userEvent.click(page.getByRole('button', { name: /not a bot/ }));
    await userEvent.click(page.getByRole('button', { name: /Email me/ }));
    await expect(await page.findByRole('alert')).toHaveTextContent(
      /couldn’t confirm you’re not a bot/,
    );
    await expect(page.getByRole('button', { name: /Email me/ })).toBeDisabled();
  },
};

/** Cloudflare's script was blocked: nothing on the page would say why. */
export const CaptchaUnloaded: Story = {
  ...desktop,
  args: { captchaSiteKey: 'storybook' },
  beforeEach: () => {
    turnstile.loads = false;
    return () => {
      turnstile.loads = true;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('alert')).toHaveTextContent(
      /didn’t load/,
    );
  },
};
