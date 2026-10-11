import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { expectOpen, failing, phone, screen, stalled } from '@/mocks/screen';
import { AppShell } from './app-shell';
import { Home } from './home';

/**
 * Feedback from the header, in each state a user sees: the button on every
 * screen, the form, sending, sent and a failed send.
 */
const meta = {
  title: 'Parts/Feedback',
  component: AppShell,
  parameters: screen('/').parameters,
  args: { children: <Home /> },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const MESSAGE = 'The Northwind invoice total looks $150 short of Home.';

const openForm: Story['play'] = async ({ canvasElement }) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Feedback' }));
  await expectOpen(canvasElement, 'dialog', 'Send feedback');
};

const typeAndSend = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.type(page.getByRole('textbox', { name: 'Message' }), MESSAGE);
  await userEvent.click(page.getByRole('button', { name: 'Send' }));
  return page;
};

/** The button beside the account, on every signed-in screen. */
export const Closed: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('button', { name: 'Feedback' }),
    ).toBeVisible();
  },
};

/** Opened: an empty message, and Send waits for text. */
export const Open: Story = {
  play: async (ctx) => {
    await openForm(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  },
};

/** Typed: the count climbs toward 2,000. */
export const Typing: Story = {
  play: async (ctx) => {
    await openForm(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await userEvent.type(
      page.getByRole('textbox', { name: 'Message' }),
      MESSAGE,
    );
    await expect(page.getByText(/^53 \/ 2,000/)).toBeVisible();
  },
};

/** Sending: the form is locked and Send says so. */
export const Sending: Story = {
  parameters: stalled('sendFeedback'),
  play: async (ctx) => {
    await openForm(ctx);
    const page = await typeAndSend(ctx.canvasElement);
    await expect(
      await page.findByRole('button', { name: /Sending/ }),
    ).toBeDisabled();
  },
};

/** Sent: the form closes and a toast thanks them. */
export const Sent: Story = {
  play: async (ctx) => {
    await openForm(ctx);
    const page = await typeAndSend(ctx.canvasElement);
    await expect(await page.findByText('Thanks. Feedback sent.')).toBeVisible();
  },
};

/** Failed: the message stays, and the form says it couldn't send. */
export const Failed: Story = {
  parameters: failing('sendFeedback'),
  play: async (ctx) => {
    await openForm(ctx);
    const page = await typeAndSend(ctx.canvasElement);
    await expect(await page.findByRole('alert')).toHaveTextContent(
      'Couldn’t send. Your message is still here. Try again.',
    );
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue(
      MESSAGE,
    );
  },
};

/** On a phone the button stays in the header and the form fits the width. */
export const Phone: Story = { ...phone, play: openForm };
