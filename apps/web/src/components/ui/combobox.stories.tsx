import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Combobox, type ComboboxOption } from './combobox';
import { Label } from './label';

const OPTIONS: ComboboxOption[] = Intl.supportedValuesOf('timeZone').map(
  (z) => ({ value: z, label: z.replaceAll('_', ' ') }),
);

function Field(props: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [value, setValue] = useState(props.value);
  return (
    <div className="flex h-96 w-72 flex-col gap-2">
      <Label htmlFor="zone">Billing time zone</Label>
      <Combobox
        id="zone"
        value={value}
        onChange={(v) => {
          setValue(v);
          props.onChange(v);
        }}
        options={OPTIONS}
        unset="Not set"
        searchLabel="Search time zones"
      />
    </div>
  );
}

const meta = {
  title: 'Primitives/Combobox',
  component: Field,
  args: { value: 'America/New_York', onChange: fn() },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = (el: HTMLElement) => within(el.ownerDocument.body);
const trigger = (el: HTMLElement) =>
  within(el).getByRole('combobox', { name: 'Billing time zone' });
const open = async (el: HTMLElement) => {
  await userEvent.click(trigger(el));
  return body(el).findByRole('listbox');
};

/** A saved value the list lacks still shows as itself. */
export const SavedValueNotListed: Story = {
  args: { value: 'Mars/Olympus_Mons' },
  play: async ({ canvasElement }) => {
    await expect(trigger(canvasElement)).toHaveTextContent('Mars/Olympus_Mons');
  },
};

/** Open, the trigger says so, the search has focus and the saved option
    is checked. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await expect(trigger(canvasElement)).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await open(canvasElement);
    await expect(trigger(canvasElement)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const page = body(canvasElement);
    await expect(
      page.getByRole('combobox', { name: 'Search time zones' }),
    ).toHaveFocus();
    await expect(
      page.getByRole('option', { name: 'America/New York' }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getAllByRole('option')[0]).toHaveTextContent('Not set');
  },
};

/** Typing filters the list to what matches, by label or by IANA name. */
export const Filtered: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement);
    for (const search of ['los ang', 'america/los_angeles']) {
      await userEvent.clear(body(canvasElement).getByRole('combobox', { name: 'Search time zones' }));
      await userEvent.keyboard(search);
      const shown = within(list).getAllByRole('option');
      await expect(shown).toHaveLength(1);
      await expect(shown[0]).toHaveTextContent('America/Los Angeles');
    }
  },
};

export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement);
    await userEvent.keyboard('zzzz');
    const [only, ...rest] = within(list).getAllByRole('option');
    await expect(rest).toHaveLength(0);
    await expect(only).toHaveTextContent('No matches');
    await expect(only).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Hundreds of zones scroll inside an 18rem list, not past the screen. */
export const LongListScrolls: Story = {
  play: async ({ canvasElement }) => {
    const list = await open(canvasElement);
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(list.clientHeight).toBeLessThanOrEqual(18 * rem);
    await expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
  },
};

/** Keyboard only: open, search, arrow, Enter picks; Escape closes without. */
export const KeyboardPick: Story = {
  play: async ({ args, canvasElement }) => {
    trigger(canvasElement).focus();
    await userEvent.keyboard('{Enter}');
    await body(canvasElement).findByRole('listbox');
    // Two match: New York, then North Dakota's New Salem.
    await userEvent.keyboard('new');
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowDown}{Enter}');
    await expect(args.onChange).toHaveBeenCalledWith(
      'America/North_Dakota/New_Salem',
    );
    await expect(trigger(canvasElement)).toHaveTextContent(
      'America/North Dakota/New Salem',
    );
    await expect(trigger(canvasElement)).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await body(canvasElement).findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await expect(body(canvasElement).queryByRole('listbox')).toBeNull();
    await expect(args.onChange).toHaveBeenCalledTimes(1);
  },
};

/** The first item saves null. */
export const PickUnset: Story = {
  play: async ({ args, canvasElement }) => {
    await open(canvasElement);
    await userEvent.click(
      body(canvasElement).getByRole('option', { name: 'Not set' }),
    );
    await expect(args.onChange).toHaveBeenCalledWith(null);
    await expect(trigger(canvasElement)).toHaveTextContent('Not set');
  },
};
