import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SettingsForm } from '@/components/settings-form';
import type { Settings } from '@/lib/client/api';

/**
 * The monthly goal's two fields, which the database requires to be set or
 * cleared together.
 *
 * These cover what a browser caught and nothing else did: `schedule` replaces
 * the queued payload rather than merging into it, so a patch carrying one of
 * the pair silently drops the other, and the constraint then rejects the
 * write. Every assertion here is about the PAIR, not about either field.
 */

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function settings(over: Partial<Settings> = {}): Settings {
  return {
    defaultHourlyRate: 125,
    currency: 'USD',
    weekStartsOn: 1,
    timeFormat: '24h',
    maxTimerHours: 8,
    businessName: 'Blake Eriks',
    businessAddress: null,
    businessEmail: 'dev@localhost.test',
    logoUrl: null,
    taxId: null,
    defaultPaymentTerms: 'Net 30',
    invoiceNumberPrefix: 'STINT-',
    nextInvoiceNumber: 1,
    paymentNotice: null,
    monthlyTarget: 120,
    monthlyTargetUnit: 'hours',
    ...over,
  } as Settings;
}

/** Captures every PATCH body so a test can assert on what was actually sent. */
function serve(initial: Settings) {
  const patches: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patches.push(JSON.parse(String(init.body)));
      }
      // The client reads `res.text()` and parses it itself.
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(initial),
      } as Response;
    }),
  );
  return patches;
}

afterEach(() => vi.unstubAllGlobals());

async function goalFields() {
  const target = await screen.findByLabelText('Target');
  const unit = await screen.findByLabelText('Measured in');
  return { target, unit };
}

/**
 * The unit is a Radix Select, so its options exist only while the listbox is
 * open — there is no `selectOptions` to reach them with.
 */
async function chooseUnit(
  user: ReturnType<typeof userEvent.setup>,
  unit: HTMLElement,
  label: string,
) {
  await user.click(unit);
  await user.click(await screen.findByRole('option', { name: label }));
}

describe('the monthly goal writes its target and unit together', () => {
  it('sends both fields when the target is typed', async () => {
    const user = userEvent.setup();
    const patches = serve(
      settings({ monthlyTarget: null, monthlyTargetUnit: null }),
    );
    render(<SettingsForm />, { wrapper });

    const { target } = await goalFields();
    await user.type(target, '150');

    await waitFor(() => expect(patches.length).toBeGreaterThan(0));
    const last = patches.at(-1);
    expect(last).toHaveProperty('monthlyTarget');
    expect(last).toHaveProperty('monthlyTargetUnit');
    expect(last?.monthlyTargetUnit).toBe('hours');
  });

  /**
   * Clearing is the direction that breaks the constraint: a patch nulling the
   * target while leaving a unit behind is rejected by the database.
   */
  it('clears the unit with the target, never one alone', async () => {
    const user = userEvent.setup();
    const patches = serve(settings());
    render(<SettingsForm />, { wrapper });

    const { target } = await goalFields();
    await user.clear(target);

    await waitFor(() => expect(patches.length).toBeGreaterThan(0));
    expect(patches.at(-1)).toEqual({
      monthlyTarget: null,
      monthlyTargetUnit: null,
    });
  });

  /**
   * The bug a browser caught: choosing a unit before typing a target wrote
   * null for the unit, which snapped the select back to Hours mid-choice.
   * The displayed unit outlives an empty target; only the pair is persisted.
   */
  it('keeps a unit chosen while the target is still empty', async () => {
    const user = userEvent.setup();
    const patches = serve(
      settings({ monthlyTarget: null, monthlyTargetUnit: null }),
    );
    render(<SettingsForm />, { wrapper });

    const { unit } = await goalFields();
    await chooseUnit(user, unit, 'Revenue');

    expect(unit).toHaveTextContent('Revenue');
    // Nothing persistable yet: a unit alone violates the constraint.
    for (const p of patches) {
      expect(p.monthlyTargetUnit).toBeNull();
      expect(p.monthlyTarget).toBeNull();
    }
  });

  it('pairs a later target with the unit chosen before it', async () => {
    const user = userEvent.setup();
    const patches = serve(
      settings({ monthlyTarget: null, monthlyTargetUnit: null }),
    );
    render(<SettingsForm />, { wrapper });

    const { target, unit } = await goalFields();
    await chooseUnit(user, unit, 'Revenue');
    await user.type(target, '10000');

    await waitFor(() => expect(patches.length).toBeGreaterThan(0));
    expect(patches.at(-1)).toEqual({
      monthlyTarget: 10000,
      monthlyTargetUnit: 'revenue',
    });
  });
});
