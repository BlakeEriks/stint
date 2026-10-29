import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { http } from 'msw';
import { addDays, localDateKey, localDateTimeToInstant } from '@stint/core';
import { account } from '@/mocks/db';
import { handlers } from '@/mocks/handlers';
import { envelopes, ok } from '@/mocks/respond';
import { ZONE } from '@/mocks/time.mts';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import {
  desktop,
  failing,
  light,
  phone,
  screen,
  tablet,
  wide,
  expectOpen,
  stalled,
} from '@/mocks/screen';
import { ZOOM_KEY } from '@/lib/client/use-zoom';
import { Calendar } from './calendar';

const meta = {
  title: 'Screens/Calendar',
  component: Calendar,
  ...screen('/calendar'),
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The calendar alone, apart from the shell around it. */
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
    await expect(page.queryByRole('status')).toBeNull();
  },
};
/** At `2xl` the grid scrolls inside the card. The screen is a workspace:
    the dock folds to a strip, so the week takes the dock's room. */
export const Wide: Story = {
  ...wide,
  play: async ({ canvasElement }) => {
    await calendar(canvasElement);
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('complementary', {
        name: 'At a glance',
      }),
    ).toBeNull();
  },
};
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

/**
 * The stylesheet rules that would give `el` an opacity under a pointer: a
 * `:hover` rule that matches it once the `:hover` is dropped, or any rule in
 * a no-hover (touch) media block. A play's hover is synthetic and never
 * applies `:hover`, so the rules themselves are what it can check.
 */
function pointerReveals(el: Element) {
  const found: string[] = [];
  for (const sheet of Array.from(el.ownerDocument.styleSheets)) {
    for (const [rule, touch] of styleRules(readable(sheet))) {
      const bare = rule.selectorText.replaceAll(':hover', '');
      const pointer = touch || bare !== rule.selectorText;
      if (rule.style.opacity && pointer && safeMatches(el, bare))
        found.push(rule.selectorText);
    }
  }
  return found;
}

/** Each style rule in `rules`, and whether it sits in a no-hover block. */
function* styleRules(
  rules: CSSRuleList | [],
  touch = false,
): Generator<[CSSStyleRule, boolean]> {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) yield [rule, touch];
    else if (rule instanceof CSSGroupingRule) {
      const none =
        rule instanceof CSSMediaRule &&
        /hover:\s*none/.test(rule.conditionText);
      yield* styleRules(rule.cssRules, touch || none);
    }
  }
}

/** A sheet's rules, or none for a cross-origin sheet, which styles nothing
    here and refuses to be read. */
function readable(sheet: CSSStyleSheet): CSSRuleList | [] {
  try {
    return sheet.cssRules;
  } catch (e) {
    if (e instanceof DOMException) return [];
    throw e;
  }
}

function safeMatches(el: Element, selector: string) {
  try {
    return el.matches(selector);
  } catch (e) {
    if (e instanceof DOMException) return false;
    throw e;
  }
}

/** A day heading's "+" is the keyboard's way into Add: hidden under a
    pointer or a touch, which draw on the grid instead, and shown on focus. */
export const AddFromKeyboard: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    const [add] = await page.findAllByRole('button', {
      name: /^Add an entry on/,
    });
    const el = add as HTMLElement;

    await expect(getComputedStyle(el).opacity).toBe('0');
    await expect(pointerReveals(el)).toEqual([]);

    el.focus({ focusVisible: true } as FocusOptions);
    await waitFor(() => expect(getComputedStyle(el).opacity).toBe('1'));
  },
};

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
      name: /^Edit Overnight deploy/,
    });
    await expect(blocks).toHaveLength(2);
    // An hour each side of midnight: the second block ends at 01:00.
    const [before, after] = blocks.map((b) => b.getBoundingClientRect().height);
    await expect(after).toBeCloseTo(before ?? 0, 0);
  },
};

/* Held until the play has seen the loader, then answered: the story
   ends only once nothing is in flight. */
let answer = () => {};

/** The week has not arrived yet: one quiet word where the grid will be, and
 *  no empty grid that would read as a week with nothing in it. */
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
    await expect(await page.findByRole('status')).toHaveTextContent('Loading');
    await expect(page.queryByText('00', { exact: true })).toBeNull();
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
      await page.findByText('Could not load this. Try again.'),
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

/** The first column of the week, and the height `at` of the way down it. */
async function column(canvasElement: HTMLElement) {
  const page = await calendar(canvasElement);
  await page.findAllByRole('button', { name: /^Edit / });
  const [first] =
    canvasElement.ownerDocument.querySelectorAll<HTMLElement>('main .border-l');
  const el = first as HTMLElement;
  const box = el.getBoundingClientRect();
  return { el, x: box.left + 10, y: (at: number) => box.top + at * box.height };
}

/** Press at 02:00 and drag to 04:00, letting go when `release`. */
async function drawAcross(
  el: HTMLElement,
  clientX: number,
  y: (at: number) => number,
  release: boolean,
) {
  await userEvent.pointer([
    {
      target: el,
      coords: { clientX, clientY: y(2 / 24) },
      keys: '[MouseLeft>]',
    },
    { target: el, coords: { clientX, clientY: y(4 / 24) } },
    ...(release ? [{ target: el, keys: '[/MouseLeft]' }] : []),
  ]);
}

/** Pressing on empty grid and dragging draws the entry's range, snapped;
    nothing is written until the editor saves. Held mid-drag. */
export const Drawing: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    // 02:00 to 04:00, hours the seed leaves empty.
    const { el, x, y } = await column(canvasElement);
    await drawAcross(el, x, y, false);
    const ghost = el.querySelector('[data-drawing]');
    await expect(ghost).not.toBeNull();
    await expect(ghost).toHaveTextContent(/2:00 AM–4:00 AM/);
  },
};

/** Released, the drawn range opens the editor on those times. */
export const DrawnOpensEditor: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    await drawAcross(el, x, y, true);
    await expectOpen(canvasElement, 'dialog', 'Add entry');
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByLabelText('Start')).toHaveValue('02:00');
    await expect(page.getByLabelText('End')).toHaveValue('04:00');
  },
};

/** A 15-minute block: each end's target reaches past the edge rather than
    into the block, so the two never meet and the middle still moves it. */
export const ShortBlock: Story = {
  ...desktop,
  parameters: account((db) => {
    const [first] = db.entries;
    if (!first) return;
    const today = localDateKey(db.now, ZONE);
    db.entries.push({
      ...first,
      id: '018f0000-0000-7000-8000-0000000000ef',
      taskName: 'Quick call',
      startedAt: localDateTimeToInstant(today, '06:00', ZONE).toISOString(),
      endedAt: localDateTimeToInstant(today, '06:15', ZONE).toISOString(),
      durationSeconds: 900,
      invoiceId: null,
    });
  }),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    const block = await page.findByRole('button', { name: /^Edit Quick call/ });
    await userEvent.hover(block);
    const [start, end] = [...block.querySelectorAll('.cursor-ns-resize')].map(
      (h) => h.getBoundingClientRect(),
    );
    const box = block.getBoundingClientRect();
    await expect(start?.top).toBeLessThan(box.top);
    await expect(end?.bottom).toBeGreaterThan(box.bottom);
    // Room left between the two ends for the move.
    await expect((end?.top ?? 0) - (start?.bottom ?? 0)).toBeGreaterThan(0);
  },
};

/** Zoomed all the way in: an hour is 176px, and every hour is labeled. */
export const ZoomedIn: Story = {
  ...desktop,
  beforeEach: () => localStorage.setItem(ZOOM_KEY, '176'),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await expect(
      (await page.findAllByText('01', { exact: true }))[0],
    ).toBeInTheDocument();
  },
};

/** Zoomed all the way out: an hour is 22px, labeled every six. */
export const ZoomedOut: Story = {
  ...desktop,
  beforeEach: () => localStorage.setItem(ZOOM_KEY, '22'),
  play: async ({ canvasElement }) => {
    const page = await calendar(canvasElement);
    await page.findAllByText('06', { exact: true });
    await expect(page.queryByText('03', { exact: true })).toBeNull();
  },
};

/** A pinch over the grid zooms it, and the browser's page zoom is refused. */
export const Pinch: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    const before = el.getBoundingClientRect().height;
    const pinch = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: x,
      clientY: y(0.5),
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(pinch);
    await expect(pinch.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(el.getBoundingClientRect().height).toBeGreaterThan(before),
    );
  },
};

/** Saved and not yet answered: the editor has closed, and the drawn entry
    is on the grid at once, faded as a dropped drag is until the server
    answers. */
export const DrawnSaving: Story = {
  ...desktop,
  parameters: stalled('createEntry'),
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    await drawAcross(el, x, y, true);
    await expectOpen(canvasElement, 'dialog', 'Add entry');
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(page.getByLabelText('Task'), 'Drawn work');
    await userEvent.click(page.getByRole('button', { name: 'Add entry' }));
    const block = (await page.findByText(/^Drawn work, .*, saving$/)).closest(
      '[aria-busy="true"]',
    );
    await expect(block).not.toBeNull();
    await expect(el.contains(block)).toBe(true);
    await expect(page.queryByRole('dialog')).toBeNull();
    await expect(getComputedStyle(block as Element).opacity).toBe('0.7');
  },
};

/** Zoomed all the way out on a tall screen: the day still fills the grid's
    area, so the legend stays at the bottom of the card with no gap above. */
export const ZoomOutFills: Story = {
  ...wide,
  beforeEach: () => localStorage.setItem(ZOOM_KEY, '22'),
  play: async ({ canvasElement }) => {
    const { el } = await column(canvasElement);
    const area = el.parentElement?.parentElement as HTMLElement;
    // Filled exactly: nothing left to scroll, so no scrollbar.
    await waitFor(() => expect(area.scrollHeight).toBe(area.clientHeight));
    // At most the pixel the area's height is rounded down by.
    await expect(
      area.clientHeight - el.getBoundingClientRect().height,
    ).toBeLessThanOrEqual(1);
    // Taller than 22px an hour would draw it: the floor is the area's.
    await expect(area.clientHeight).toBeGreaterThan(24 * 22 + 10);
  },
};

/** A mouse over empty time shows the quarter hour a press would start,
    and nothing over an entry. */
export const HoverSlot: Story = {
  ...desktop,
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    await userEvent.pointer({
      target: el,
      coords: { clientX: x, clientY: y((2 * 60 + 7) / 1440) },
    });
    const slot = el.querySelector('[data-hover-slot]');
    await expect(slot).toHaveTextContent('+ 2:00 AM');

    // A scroll moves the grid under the pointer, so the slot goes with it.
    el.parentElement?.parentElement?.dispatchEvent(new Event('scroll'));
    await waitFor(() =>
      expect(el.querySelector('[data-hover-slot]')).toBeNull(),
    );
    await userEvent.pointer({
      target: el,
      coords: { clientX: x, clientY: y((2 * 60 + 7) / 1440) },
    });

    const page = within(canvasElement.ownerDocument.body);
    const [block] = await page.findAllByRole('button', { name: /^Edit / });
    const box = (block as HTMLElement).getBoundingClientRect();
    await userEvent.pointer({
      target: block as HTMLElement,
      coords: { clientX: box.left + 5, clientY: box.top + box.height / 2 },
    });
    await expect(
      canvasElement.ownerDocument.querySelector('[data-hover-slot]'),
    ).toBeNull();
  },
};

/** Zoomed all the way out, a quarter hour is too short for its label, so
    the slot, and the entry a click makes, is an hour: the label shows
    whole, and the click opens on exactly that hour. */
export const HoverSlotZoomedOut: Story = {
  ...desktop,
  beforeEach: () => localStorage.setItem(ZOOM_KEY, '22'),
  play: async ({ canvasElement }) => {
    const { el, x, y } = await column(canvasElement);
    await userEvent.pointer({
      target: el,
      coords: { clientX: x, clientY: y((2 * 60 + 7) / 1440) },
    });
    const slot = el.querySelector('[data-hover-slot]') as HTMLElement;
    await expect(slot).toHaveTextContent('+ 2:00 AM');
    await expect(slot.scrollHeight).toBeLessThanOrEqual(slot.clientHeight);

    await userEvent.pointer({
      target: el,
      coords: { clientX: x, clientY: y((2 * 60 + 7) / 1440) },
      keys: '[MouseLeft]',
    });
    await expectOpen(canvasElement, 'dialog', 'Add entry');
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByLabelText('Start')).toHaveValue('02:00');
    await expect(page.getByLabelText('End')).toHaveValue('03:00');
  },
};
