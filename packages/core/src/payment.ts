/**
 * Payment details as they appear on an invoice.
 *
 * Bank details belong on the invoice document, never in an email body:
 * details that render identically on every invoice create a baseline, so a
 * *change* becomes visible and questionable, which is what fraud-prevention
 * guidance tells payers to challenge.
 *
 * US-first. ACH (routing + account number) is the default path; the
 * international fields are additive.
 */

export interface PaymentProfile {
  id?: string;
  name?: string;
  accountHolderName?: string | null;
  accountHolderAddress?: string | null;
  bankName?: string | null;
  bankAddress?: string | null;
  accountNumber?: string | null;
  routingNumber?: string | null;
  accountType?: 'checking' | 'savings' | null;
  iban?: string | null;
  swiftBic?: string | null;
  localCodeLabel?: string | null;
  localCode?: string | null;
  intermediaryBankName?: string | null;
  intermediarySwiftBic?: string | null;
  intermediaryAccountNumber?: string | null;
  paymentLinkLabel?: string | null;
  paymentLinkUrl?: string | null;
  currency?: string | null;
  feeAllocation?: 'OUR' | 'SHA' | 'BEN' | null;
  notes?: string | null;
}

/** A label/value pair ready to render. Only populated fields appear. */
export interface PaymentField {
  label: string;
  value: string;
}

export interface PaymentDetails {
  /** The profile's name, e.g. "USD wire". Omitted when it adds nothing. */
  title: string | null;
  fields: PaymentField[];
  intermediary: PaymentField[];
  link: { label: string; url: string } | null;
  notes: string | null;
}

const has = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const FEE_TEXT: Record<string, string> = {
  OUR: 'Sender pays all transfer fees (OUR)',
  SHA: 'Transfer fees shared (SHA)',
  BEN: 'Beneficiary pays transfer fees (BEN)',
};

/**
 * Flattens a profile into renderable fields, dropping anything unset.
 *
 * Ordering follows how a payer works through a transfer form: who is being
 * paid, at which bank, by which numbers — US rails first, then the
 * international fields only if present.
 */
export function buildPaymentDetails(
  profile: PaymentProfile | null | undefined,
  opts: { invoiceNumber?: string } = {},
): PaymentDetails | null {
  if (!profile) return null;

  const fields: PaymentField[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (has(value)) fields.push({ label, value: value.trim() });
  };

  push('Account holder', profile.accountHolderName);
  push('Bank', profile.bankName);
  push('Account number', profile.accountNumber);
  push('Routing number (ACH)', profile.routingNumber);

  if (has(profile.accountType)) {
    push(
      'Account type',
      profile.accountType === 'checking' ? 'Checking' : 'Savings',
    );
  }

  push('IBAN', profile.iban);
  push('SWIFT / BIC', profile.swiftBic);

  // A labeled pair covers every national clearing scheme (sort code, BSB…)
  // without a migration per country.
  if (has(profile.localCode)) {
    push(
      has(profile.localCodeLabel) ? profile.localCodeLabel : 'Bank code',
      profile.localCode,
    );
  }

  push('Bank address', profile.bankAddress);
  push('Account holder address', profile.accountHolderAddress);
  push('Currency', profile.currency);

  if (has(profile.feeAllocation)) {
    const text = FEE_TEXT[profile.feeAllocation];
    if (text) fields.push({ label: 'Transfer fees', value: text });
  }

  // Quoting the invoice number is what makes a payment reconcilable, and a
  // mismatched reference is a visible signal something is wrong.
  if (has(opts.invoiceNumber)) {
    fields.push({ label: 'Payment reference', value: opts.invoiceNumber });
  }

  const intermediary: PaymentField[] = [];
  const pushIntermediary = (
    label: string,
    value: string | null | undefined,
  ) => {
    if (has(value)) intermediary.push({ label, value: value.trim() });
  };
  pushIntermediary('Intermediary bank', profile.intermediaryBankName);
  pushIntermediary('Intermediary SWIFT / BIC', profile.intermediarySwiftBic);
  pushIntermediary('Intermediary account', profile.intermediaryAccountNumber);

  const link = has(profile.paymentLinkUrl)
    ? {
        label: has(profile.paymentLinkLabel)
          ? profile.paymentLinkLabel
          : 'Pay online',
        url: profile.paymentLinkUrl,
      }
    : null;

  // Nothing to render: don't emit an empty section header.
  if (
    fields.length === 0 &&
    intermediary.length === 0 &&
    !link &&
    !has(profile.notes)
  ) {
    return null;
  }

  return {
    // A single generic profile name adds no information next to the
    // section heading.
    title:
      has(profile.name) && profile.name.trim().toLowerCase() !== 'default'
        ? profile.name.trim()
        : null,
    fields,
    intermediary,
    link,
    notes: has(profile.notes) ? profile.notes.trim() : null,
  };
}

/**
 * Which profile applies to an invoice: the client's choice, else the user's
 * default. Mirrors how rates resolve — most specific wins.
 */
export function resolvePaymentProfile<T extends { id?: string }>(
  profiles: T[],
  opts: { clientProfileId?: string | null; defaultProfileId?: string | null },
): T | null {
  if (opts.clientProfileId) {
    const chosen = profiles.find((p) => p.id === opts.clientProfileId);
    if (chosen) return chosen;
  }
  if (opts.defaultProfileId) {
    const fallback = profiles.find((p) => p.id === opts.defaultProfileId);
    if (fallback) return fallback;
  }
  return null;
}
