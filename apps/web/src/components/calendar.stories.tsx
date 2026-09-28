import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { account } from '@/mocks/db';
import { userEvent, within } from 'storybook/test';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  tablet,
  wide,
  expectOpen,
} from '@/mocks/screen';
import { Calendar } from './calendar';

const meta = {
  title: 'Screens/Calendar',
  component: Calendar,
  ...screen('/calendar'),
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The week: seven columns, blocks in their client's color, a legend of
    what is on screen. */
export const Desktop: Story = { ...desktop };
/** At `2xl` the grid scrolls inside the card. */
export const Wide: Story = { ...wide };
export const Tablet: Story = { ...tablet };
/** Below `sm`, one day, cropped to the hours worked. */
export const Phone: Story = { ...phone };
export const Light: Story = { ...light };

/** A running block grows to now and refuses a drag. */
export const Running: Story = { ...desktop, parameters: account('running') };

/** Nothing logged: the grid still offers a time to click. */
export const Empty: Story = { ...desktop, parameters: account('empty') };

export const Failed: Story = { ...desktop, parameters: failing('calendar') };

/** A block opens its entry in the editor. */
export const EditEntry: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [block] = await page.findAllByRole('button', {
      name: /Pairing on the ingest job/,
    });
    await userEvent.click(block as HTMLElement);
    await expectOpen(canvasElement, 'dialog', 'Edit entry');
  },
};
