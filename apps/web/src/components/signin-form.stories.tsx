import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthApiError } from '@supabase/supabase-js';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, light, phone } from '@/mocks/screen';
import { code, otp } from '@/mocks/supabase';
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

/** The CAPTCHA was blocked or couldn't connect: an existing account can
    still ask for a code, and the button needs no token. */
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
    await userEvent.type(page.getByLabelText('Email'), 'a@x.test');
    await expect(
      page.getByRole('button', { name: 'Email me a code' }),
    ).toBeEnabled();
  },
};

/** The code is on its way: the email step gives way to the code. */
export const CodeSent: Story = {
  ...CaptchaUnloaded,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(await page.findByLabelText('Email'), 'a@x.test');
    await userEvent.click(
      page.getByRole('button', { name: 'Email me a code' }),
    );
    await expect(await page.findByLabelText('Sign-in code')).toBeVisible();
    await expect(page.getByText(/If a@x.test has an account/)).toBeVisible();
  },
};

/** A wrong or spent code: the code step stays, and says why. */
export const CodeFailed: Story = {
  ...CaptchaUnloaded,
  beforeEach: () => {
    turnstile.loads = false;
    code.error = new AuthApiError('Token has expired', 403, 'otp_expired');
    return () => {
      turnstile.loads = true;
      code.error = null;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.type(await page.findByLabelText('Email'), 'a@x.test');
    await userEvent.click(
      page.getByRole('button', { name: 'Email me a code' }),
    );
    await userEvent.type(await page.findByLabelText('Sign-in code'), '000000');
    await userEvent.click(page.getByRole('button', { name: 'Sign in' }));
    await expect(await page.findByRole('alert')).toHaveTextContent(
      /That code didn’t work/,
    );
    await expect(page.getByLabelText('Sign-in code')).toBeVisible();
  },
};
