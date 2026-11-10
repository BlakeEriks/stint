import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, delay, http } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
import { desktop, phone } from '@/mocks/screen';
import { InviteRequest } from './invite-request';

/* `.storybook/vite-mocks.mts` points the form at a stand-in URL; each story
   that sends answers it here. MSW fails a story only on an unanswered
   `/api/` request, so a story asserting nothing is sent spies on it. */
const ENDPOINT = process.env.NEXT_PUBLIC_INVITE_FORM_URL ?? '';
const answer = (respond: Parameters<typeof http.post>[1]) => ({
  msw: { handlers: { invite: http.post(ENDPOINT, respond) } },
});

/** The landing page's call to action, on the page's own ground. */
const meta = {
  title: 'Parts/InviteRequest',
  component: InviteRequest,
  decorators: [
    (Story) => (
      <div className="bg-surface-base p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InviteRequest>;

export default meta;
type Story = StoryObj<typeof meta>;

async function send(canvasElement: HTMLElement, address = 'new@example.com') {
  const page = within(canvasElement);
  await userEvent.type(page.getByLabelText('Email'), address);
  await userEvent.click(
    page.getByRole('button', { name: 'Request an invite' }),
  );
  return page;
}

/** Before anything is typed. */
export const Open: Story = { ...desktop };
export const Phone: Story = { ...phone };

/** The service hasn't answered: the button says so and can't be pressed twice. */
export const Sending: Story = {
  ...desktop,
  parameters: { stalls: 1, ...answer(() => delay('infinite')) },
  play: async ({ canvasElement }) => {
    const page = await send(canvasElement);
    await expect(
      await page.findByRole('button', { name: 'Sending…' }),
    ).toBeDisabled();
    await expect(page.getByLabelText('Email')).toHaveAttribute('readonly');
  },
};

/** Accepted: the confirmation replaces the form. */
export const Sent: Story = {
  ...desktop,
  parameters: answer(() => HttpResponse.json({ ok: true })),
  play: async ({ canvasElement }) => {
    const page = await send(canvasElement);
    await expect(
      await page.findByText('You’re on the list.'),
    ).toBeInTheDocument();
    await expect(page.getByText(/new@example\.com/)).toBeInTheDocument();
    await expect(page.queryByLabelText('Email')).toBeNull();
  },
};

/** The service failed: the address stays, and the form says to try again. */
export const Failed: Story = {
  ...desktop,
  parameters: answer(() => new HttpResponse(null, { status: 500 })),
  play: async ({ canvasElement }) => {
    const page = await send(canvasElement);
    await expect(await page.findByRole('alert')).toHaveTextContent(
      /didn’t send/,
    );
    await expect(page.getByLabelText('Email')).toHaveValue('new@example.com');
    await expect(
      page.getByRole('button', { name: 'Request an invite' }),
    ).toBeEnabled();
  },
};

/** Not an email: the browser stops it, and nothing is sent. */
const invalidSent = fn(() => HttpResponse.json({ ok: true }));
export const Invalid: Story = {
  ...desktop,
  parameters: answer(invalidSent),
  play: async ({ canvasElement }) => {
    invalidSent.mockClear();
    const page = await send(canvasElement, 'not-an-email');
    await expect(page.getByLabelText('Email')).toBeInvalid();
    await expect(
      page.getByRole('button', { name: 'Request an invite' }),
    ).toBeEnabled();
    // A request would land within a tick; give it one before asserting none.
    await new Promise((settle) => setTimeout(settle, 100));
    await expect(invalidSent).not.toHaveBeenCalled();
  },
};
