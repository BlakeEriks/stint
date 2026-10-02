import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ApiError } from '@/lib/client/api';
import { useOptimisticMutation } from '@/lib/client/mutations';
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
