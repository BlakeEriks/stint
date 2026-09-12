import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaymentDetails,
  resolvePaymentProfile,
  type PaymentProfile,
} from '../src/payment.ts';

const us: PaymentProfile = {
  id: 'p1',
  name: 'USD ACH',
  accountHolderName: 'Blake Eriks',
  bankName: 'First Republic',
  accountNumber: '1234567890',
  routingNumber: '021000021',
  accountType: 'checking',
};

const labels = (d: ReturnType<typeof buildPaymentDetails>) =>
  (d?.fields ?? []).map((f) => f.label);

test('a US profile renders the ACH fields in payer order', () => {
  const d = buildPaymentDetails(us);
  assert.deepEqual(labels(d), [
    'Account holder',
    'Bank',
    'Account number',
    'Routing number (ACH)',
    'Account type',
  ]);
  assert.equal(d!.fields[4]!.value, 'Checking');
});

test('unset fields are omitted entirely, not rendered blank', () => {
  const d = buildPaymentDetails({
    accountHolderName: 'Blake',
    accountNumber: '123',
  });
  assert.deepEqual(labels(d), ['Account holder', 'Account number']);
  assert.equal(d!.intermediary.length, 0);
  assert.equal(d!.link, null);
});

test('whitespace-only values count as unset', () => {
  const d = buildPaymentDetails({
    accountHolderName: 'Blake',
    bankName: '   ',
  });
  assert.deepEqual(labels(d), ['Account holder']);
});

test('values are trimmed', () => {
  const d = buildPaymentDetails({ accountNumber: '  1234  ' });
  assert.equal(d!.fields[0]!.value, '1234');
});

test('an empty profile renders nothing rather than an empty section', () => {
  assert.equal(buildPaymentDetails({}), null);
  assert.equal(buildPaymentDetails(null), null);
  assert.equal(buildPaymentDetails(undefined), null);
});

test('a profile with only notes still renders', () => {
  const d = buildPaymentDetails({ notes: 'Mail checks to the address above.' });
  assert.ok(d);
  assert.equal(d.fields.length, 0);
  assert.equal(d.notes, 'Mail checks to the address above.');
});

test('international fields appear only when populated', () => {
  const d = buildPaymentDetails({
    ...us,
    iban: 'GB33BUKB20201555555555',
    swiftBic: 'BUKBGB22',
  });
  assert.ok(labels(d).includes('IBAN'));
  assert.ok(labels(d).includes('SWIFT / BIC'));
  // Still US-first.
  assert.ok(
    labels(d).indexOf('Routing number (ACH)') < labels(d).indexOf('IBAN'),
  );
});

test('the local bank code uses its own label when given', () => {
  const d = buildPaymentDetails({
    localCodeLabel: 'Sort code',
    localCode: '20-00-00',
  });
  assert.deepEqual(labels(d), ['Sort code']);
});

test('a local code with no label falls back to a generic one', () => {
  const d = buildPaymentDetails({ localCode: '20-00-00' });
  assert.deepEqual(labels(d), ['Bank code']);
});

test('a label with no code renders nothing', () => {
  assert.equal(buildPaymentDetails({ localCodeLabel: 'Sort code' }), null);
});

test('intermediary bank details are kept separate from the main block', () => {
  const d = buildPaymentDetails({
    ...us,
    intermediaryBankName: 'Citibank NA',
    intermediarySwiftBic: 'CITIUS33',
  });
  assert.deepEqual(
    d!.intermediary.map((f) => f.label),
    ['Intermediary bank', 'Intermediary SWIFT / BIC'],
  );
  assert.ok(!labels(d).some((l) => l.startsWith('Intermediary')));
});

test('fee allocation renders as plain language, not a bare code', () => {
  for (const [code, expected] of [
    ['OUR', 'Sender pays all transfer fees (OUR)'],
    ['SHA', 'Transfer fees shared (SHA)'],
    ['BEN', 'Beneficiary pays transfer fees (BEN)'],
  ] as const) {
    const d = buildPaymentDetails({ ...us, feeAllocation: code });
    assert.equal(
      d!.fields.find((f) => f.label === 'Transfer fees')!.value,
      expected,
    );
  }
});

/** Quoting the invoice number is what makes a payment reconcilable. */
test('the invoice number is added as a payment reference', () => {
  const d = buildPaymentDetails(us, { invoiceNumber: 'INV-0042' });
  const ref = d!.fields.find((f) => f.label === 'Payment reference');
  assert.equal(ref!.value, 'INV-0042');
});

test('no reference field when no invoice number is given', () => {
  const d = buildPaymentDetails(us);
  assert.ok(!labels(d).includes('Payment reference'));
});

test('a payment link is surfaced separately with a default label', () => {
  const withLabel = buildPaymentDetails({
    paymentLinkLabel: 'Pay by card',
    paymentLinkUrl: 'https://pay.example/1',
  });
  assert.deepEqual(withLabel!.link, {
    label: 'Pay by card',
    url: 'https://pay.example/1',
  });

  const bare = buildPaymentDetails({ paymentLinkUrl: 'https://pay.example/1' });
  assert.equal(bare!.link!.label, 'Pay online');
});

test('the profile name becomes a title, except when generic', () => {
  assert.equal(
    buildPaymentDetails({ ...us, name: 'USD ACH' })!.title,
    'USD ACH',
  );
  assert.equal(buildPaymentDetails({ ...us, name: 'Default' })!.title, null);
  assert.equal(buildPaymentDetails({ ...us, name: undefined })!.title, null);
});

// ── resolution ─────────────────────────────────────────────────────
const profiles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('a client preference wins over the user default', () => {
  const r = resolvePaymentProfile(profiles, {
    clientProfileId: 'b',
    defaultProfileId: 'a',
  });
  assert.equal(r!.id, 'b');
});

test('the user default applies when the client has no preference', () => {
  const r = resolvePaymentProfile(profiles, {
    clientProfileId: null,
    defaultProfileId: 'a',
  });
  assert.equal(r!.id, 'a');
});

test('a dangling client preference falls back to the default', () => {
  // The client pointed at a profile that has since been archived.
  const r = resolvePaymentProfile(profiles, {
    clientProfileId: 'gone',
    defaultProfileId: 'a',
  });
  assert.equal(
    r!.id,
    'a',
    'never leave an invoice with no payment details over a stale id',
  );
});

test('no profile at all resolves to null', () => {
  assert.equal(resolvePaymentProfile(profiles, {}), null);
  assert.equal(resolvePaymentProfile([], { defaultProfileId: 'a' }), null);
});
