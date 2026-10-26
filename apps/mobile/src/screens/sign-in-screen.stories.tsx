import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SignInScreen } from './sign-in-screen.tsx';

const meta = {
  title: 'Phone/Sign in',
  component: SignInScreen,
  args: {
    sentTo: null,
    error: null,
    pending: false,
    onSend: fn(),
    onVerify: fn(),
    onDifferentEmail: fn(),
  },
} satisfies Meta<typeof SignInScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

/** US2: an email, then "Email me a code". */
export const Email: Story = {
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    await userEvent.type(screen.getByLabelText('Email'), 'you@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Email me a code' }),
    );
    await expect(args.onSend).toHaveBeenCalledWith('you@example.com');
  },
};

/** US2: Sign in stays inert until six digits are typed. */
export const Code: Story = {
  args: { sentTo: 'you@example.com' },
  play: async ({ canvasElement, args }) => {
    const screen = within(canvasElement);
    const button = screen.getByRole('button', { name: 'Sign in' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(screen.getByLabelText('Sign-in code'), '482 193');
    await userEvent.click(button);
    await expect(args.onVerify).toHaveBeenCalledWith('482193');
  },
};

/** US2: a wrong or expired code says so and keeps the field. */
export const CodeError: Story = {
  args: {
    sentTo: 'you@example.com',
    error: 'Token has expired or is invalid',
  },
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement);
    await expect(screen.getByRole('alert')).toHaveTextContent(/expired/);
    await expect(screen.getByLabelText('Sign-in code')).toBeVisible();
  },
};

/** Constitution VI: the server decides a send, so the button shows it is waiting. */
export const Sending: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Sending…' }),
    ).toHaveAttribute('aria-busy', 'true');
  },
};
