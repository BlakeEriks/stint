import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PaymentProfiles } from '@/components/payment-profiles';
import type { PaymentProfile } from '@/lib/client/api';

const BASE: PaymentProfile = {
  id: 'pp-1',
  name: 'Chase business',
  isDefault: true,
  accountHolderName: 'Blake Eriks LLC',
  accountHolderAddress: null,
  bankName: 'Chase',
  bankAddress: null,
  accountNumber: '000123456789',
  routingNumber: '021000021',
  accountType: 'checking',
  iban: null,
  swiftBic: null,
  localCodeLabel: null,
  localCode: null,
  intermediaryBankName: null,
  intermediarySwiftBic: null,
  intermediaryAccountNumber: null,
  paymentLinkLabel: null,
  paymentLinkUrl: null,
  currency: 'USD',
  feeAllocation: null,
  notes: null,
  archivedAt: null,
};

function serve(paymentProfiles: PaymentProfile[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ paymentProfiles }), { status: 200 }),
    ),
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

describe('PaymentProfiles', () => {
  /**
   * The settings screen is glanceable and often shared or screen-shared.
   * A full account number has no reason to be in the DOM here — the edit
   * dialog is where it belongs.
   */
  it('never renders a full account number in the list', async () => {
    serve([BASE]);
    const { container } = render(<PaymentProfiles />, { wrapper });

    await screen.findByText('Chase business');
    expect(container.textContent).not.toContain('000123456789');
    expect(container.textContent).toContain('••••6789');
  });

  it('marks which profile is the default', async () => {
    serve([BASE, { ...BASE, id: 'pp-2', name: 'Wise USD', isDefault: false }]);
    render(<PaymentProfiles />, { wrapper });

    await screen.findByText('Wise USD');
    expect(screen.getAllByText('Default')).toHaveLength(1);
  });

  /** Only a non-default profile can be promoted. */
  it('offers "make default" only on profiles that are not already default', async () => {
    serve([BASE, { ...BASE, id: 'pp-2', name: 'Wise USD', isDefault: false }]);
    render(<PaymentProfiles />, { wrapper });

    await screen.findByText('Wise USD');
    expect(screen.getAllByRole('button', { name: 'Make default' })).toHaveLength(1);
  });

  it('says invoices render without a payment block when none exist', async () => {
    serve([]);
    render(<PaymentProfiles />, { wrapper });

    expect(
      await screen.findByText(/Invoices will render without a payment block/),
    ).toBeInTheDocument();
  });

  it('hides an archived profile', async () => {
    serve([{ ...BASE, id: 'pp-3', name: 'Old bank', archivedAt: '2026-01-01T00:00:00Z' }]);
    render(<PaymentProfiles />, { wrapper });

    await screen.findByText(/without a payment block/);
    expect(screen.queryByText('Old bank')).not.toBeInTheDocument();
  });
});
