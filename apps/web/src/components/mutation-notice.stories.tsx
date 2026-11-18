import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/lib/client/api';
import { useOptimisticMutation } from '@stint/client';
import { desktop, phone } from '@/mocks/screen';
import { Toast } from './toast';

/**
 * A press the server refused. `Providers` renders the notice for every
 * screen, so this story only needs something to press. `success` adds a
 * success toast beside it, to show the two tones and how they stack.
 */
function Refused({ success = false }: { success?: boolean }) {
  const press = useOptimisticMutation({
    queryKey: () => ['story'],
    mutationFn: () =>
      Promise.reject(
        new ApiError(409, {
          code: 'CONFLICT',
          message:
            'This entry is on a sent invoice, so it can’t be edited. Void the invoice to change it.',
        }),
      ),
  });
  return (
    <>
      <button type="button" onClick={() => press.mutate()}>
        Press
      </button>
      <Toast tone="success" open={success} onOpenChange={() => {}}>
        Feedback sent.
      </Toast>
    </>
  );
}

const meta = {
  title: 'Parts/MutationNotice',
  component: Refused,
} satisfies Meta<typeof Refused>;

export default meta;
type Story = StoryObj<typeof meta>;

const refuse: Story['play'] = async ({ canvasElement }) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: 'Press' }));
  await expect(await page.findByText(/on a sent invoice/)).toBeVisible();
};

/** A refusal: a red badge, a dismiss, and 10 seconds draining in red. */
export const Desktop: Story = { ...desktop, play: refuse };
export const Phone: Story = { ...phone, play: refuse };

/** A success: a check, no dismiss, and 4 seconds draining in green. */
export const Success: Story = {
  ...desktop,
  args: { success: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByText('Feedback sent.')).toBeVisible();
    await expect(page.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  },
};

/** A refusal and a success at once, stacked 8px apart. */
export const Stacked: Story = {
  ...desktop,
  args: { success: true },
  play: async (ctx) => {
    await refuse(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await expect(page.getByText('Feedback sent.')).toBeVisible();
  },
};
