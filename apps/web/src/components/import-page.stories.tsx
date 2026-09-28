import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { desktop, phone, screen } from '@/mocks/screen';
import { ImportPage } from './import-page';

const meta = {
  title: 'Screens/Settings/Import',
  component: ImportPage,
  ...screen('/settings/import'),
} satisfies Meta<typeof ImportPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/* A Toggl detailed export: a client Stint already has, a new one, and a
   block that overlaps work already logged. */
const HEAD =
  'User\tEmail\tClient\tProject\tTask\tDescription\tBillable\tStart date\tStart time\tEnd date\tEnd time\tDuration\tTags\tCurrency\tAmount';
const row = (
  client: string,
  project: string,
  task: string,
  date: string,
  from: string,
  to: string,
  duration: string,
) =>
  `Blake Eriks\tdev@localhost.test\t${client}\t${project}\t\t${task}\tYes\t${date}\t${from}\t${date}\t${to}\t${duration}\t\tUSD\t0`;
const EXPORT = [
  HEAD,
  row(
    'Northwind Trading',
    'Warehouse dashboard',
    'Picking list redesign',
    '2026-07-06',
    '09:00:00',
    '12:00:00',
    '03:00:00',
  ),
  row(
    'Northwind Trading',
    'Warehouse dashboard',
    'Picking list review',
    '2026-07-07',
    '13:00:00',
    '15:30:00',
    '02:30:00',
  ),
  row(
    'Harbor & Co',
    'Menu board',
    'Kickoff and discovery',
    '2026-07-08',
    '10:00:00',
    '11:30:00',
    '01:30:00',
  ),
  row(
    'Harbor & Co',
    'Menu board',
    'First layout pass',
    '2026-07-09',
    '09:30:00',
    '13:00:00',
    '03:30:00',
  ),
  // Overlaps the Warehouse work already in Stint on Sep 16.
  row(
    'Harbor & Co',
    'Menu board',
    'Print proofs',
    '2026-09-16',
    '10:00:00',
    '11:00:00',
    '01:00:00',
  ),
].join('\n');

const upload = async (canvasElement: HTMLElement) => {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.upload(
    await page.findByLabelText('Export file'),
    new File([EXPORT], 'toggl.tsv', { type: 'text/tab-separated-values' }),
  );
  return page;
};

/** Before a file: what the import takes and what it will not touch. */
export const NoFile: Story = { ...desktop };
export const NoFilePhone: Story = { ...phone };

/** Exactly what confirming writes: new clients get their rate and color
    here, and overlaps are listed to exclude or keep. */
export const Preview: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await upload(canvasElement);
    await expect(
      await page.findByRole('button', { name: /Import/ }),
    ).toBeVisible();
  },
};

/** A file that is not an export imports nothing, and says so. */
export const Unreadable: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.upload(
      await page.findByLabelText('Export file'),
      new File(['not,an,export'], 'notes.csv', { type: 'text/csv' }),
    );
    await expect(await page.findByText(/Nothing was imported/)).toBeVisible();
  },
};

/** After: what was written, and where to set a rate still missing. */
export const Result: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await upload(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: /Import/ }));
    await expect(
      await page.findByRole('link', { name: /calendar/i }),
    ).toBeVisible();
  },
};
