import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/lib/client/api';
import { useOptimisticMutation } from '@stint/client';
import { desktop, phone } from '@/mocks/screen';

/**
 * A press the server refused. `Providers` renders the notice for every
 * screen, so this story only needs something to press.
 */
function Refused() {
  const press = useOptimisticMutation({
    queryKey: () => ['story'],
    mutationFn: () =>
      Promise.reject(
        new ApiError(409, {
          code: 'CONFLICT',
          message: 'This entry is on an issued invoice and can’t change.',
        }),
      ),
  });
  return (
    <button type="button" onClick={() => press.mutate()}>
      Press
    </button>
  );
}

/** A re-dated entry the server took off its draft (`PATCH /entries/:id`). */
function Released() {
  const press = useOptimisticMutation({
    queryKey: () => ['story'],
    mutationFn: () => Promise.resolve({ releasedFrom: 'INV-0003' }),
  });
  return (
    <button type="button" onClick={() => press.mutate()}>
      Press
    </button>
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
  await expect(await page.findByText(/issued invoice/)).toBeVisible();
};

export const Desktop: Story = { ...desktop, play: refuse };
export const Phone: Story = { ...phone, play: refuse };

/** Moving an entry outside its draft's period says which draft it left. */
export const LeftDraft: Story = {
  ...desktop,
  render: () => <Released />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Press' }));
    await expect(
      await page.findByText(/Taken off draft INV-0003/),
    ).toBeVisible();
  },
};
