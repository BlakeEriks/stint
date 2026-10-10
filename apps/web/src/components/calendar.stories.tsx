import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { http } from 'msw';
import { addDays, localDateKey, localDateTimeToInstant } from '@stint/core';
import { account } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { envelopes, ok } from '@/mocks/respond';
import { ZONE } from '@/mocks/time.mts';
import { expect, userEvent, within } from 'storybook/test';
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

/** The calendar alone: the dock beside it lists some of the same entries. */
const calendar = async (canvasElement: HTMLElement) =>
  within(await within(canvasElement.ownerDocument.body).findByRole('main'));

/** The week: seven columns, blocks in their client's color, a legend of
    what is on screen. */
export const Desktop: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    // A block reads as its task.
    await page.findAllByText('Pairing on the ingest job');
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
      await expect(page.getByText(day, { exact: true })).toBeInTheDocument();
    /* The week never crops: one early entry would cost every column the
       same hours, so the grid keeps all 24 and scrolls instead. */
    for (const hour of ['00', '03', '06', '09', '12', '15', '18', '21'])
      await expect(
        page.getAllByText(hour, { exact: true })[0],
      ).toBeInTheDocument();
    // The week has time, so the line under the grid says nothing.
    await expect(page.queryByText(/Nothing logged this week/)).toBeNull();
    await expect(page.queryByText('Loading…')).toBeNull();
  },
};
/** At `2xl` the grid scrolls inside the card. */
export const Wide: Story = { ...wide };
export const Tablet: Story = { ...tablet };
/** Below `sm`, one day, cropped to the hours worked. */
export const Phone: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // The heading names the day on screen, not the month.
    await expect(
      await page.findByRole('heading', { name: 'Thu, Sep 17' }),
    ).toBeVisible();
    await expect(page.queryByText('September 2026')).toBeNull();
  },
};

/** The day on screen is empty while the week is not, and the line says so
    of the day. */
export const PhoneEmpty: Story = {
  ...phone,
  parameters: account((db) => {
    const today = localDateKey(db.now, ZONE);
    db.entries = db.entries.filter(
      (e) => localDateKey(new Date(e.startedAt), ZONE) !== today,
    );
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText(/Nothing logged this day/),
    ).toBeVisible();
  },
};
export const Light: Story = { ...light };

/** A running block grows to now and refuses a drag. */
export const Running: Story = { ...desktop, parameters: account('running') };

/** Nothing logged: the grid still offers a time to click. */
export const Empty: Story = {
  ...desktop,
  parameters: account('empty'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText(/Nothing logged this week/),
    ).toBeVisible();
  },
};

/** A block with no task name still reads as something. */
export const UntitledEntry: Story = {
  ...desktop,
  parameters: account((db) => {
    for (const e of db.entries)
      if (e.taskName === 'Pairing on the ingest job') e.taskName = '';
  }),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await expect(
      (await page.findAllByText('Untitled', { exact: true }))[0],
    ).toBeVisible();
  },
};

/** An entry past midnight is drawn on both days it touches, each column
    counting only its own part. */
export const Overnight: Story = {
  ...desktop,
  parameters: account((db) => {
    const today = localDateKey(db.now, ZONE);
    const [first] = db.entries;
    if (!first) return;
    db.entries.push({
      ...first,
      id: '018f0000-0000-7000-8000-0000000000ee',
      taskName: 'Overnight deploy',
      startedAt: localDateTimeToInstant(
        addDays(today, -1),
        '23:00',
        ZONE,
      ).toISOString(),
      endedAt: localDateTimeToInstant(today, '01:00', ZONE).toISOString(),
      durationSeconds: 7200,
      invoiceId: null,
    });
  }),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    const blocks = await page.findAllByRole('button', {
      name: /^Overnight deploy/,
    });
    await expect(blocks).toHaveLength(2);
    // An hour each side of midnight: the second block ends at 01:00.
    const [before, after] = blocks.map((b) => b.getBoundingClientRect().height);
    await expect(after).toBeCloseTo(before ?? 0, 0);
  },
};

/* Held until the play has seen the loading line, then answered: the story
   ends only once nothing is in flight. */
let answer = () => {};

/** The week has not arrived yet. */
export const Loading: Story = {
  ...desktop,
  parameters: {
    msw: {
      handlers: {
        calendar: http.get(handlers.calendar.info.path, async () => {
          await new Promise<void>((done) => (answer = done));
          return ok(envelopes.calendar, { days: [] });
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await expect(await page.findByText('Loading…')).toBeVisible();
    answer();
  },
};

/** A failed fetch says so, rather than calling the week empty. */
export const Failed: Story = {
  ...desktop,
  parameters: failing('calendar'),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByText('Could not load these entries. Try again.'),
    ).toBeVisible();
    await expect(page.queryByText(/Nothing logged/)).toBeNull();
  },
};

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
