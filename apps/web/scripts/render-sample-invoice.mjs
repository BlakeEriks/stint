/**
 * Renders a sample invoice from the real template to
 * `docs/design/samples/`.
 *
 * The sample is committed so the current look can be reviewed without running
 * anything, and regenerated from this script so it can never drift from the
 * template it is supposed to show.
 *
 *   node --experimental-strip-types apps/web/scripts/render-sample-invoice.mjs
 *
 * Fixture notes: deliberately exercises the awkward cases — mixed rates on one
 * invoice, a tax line, multi-line addresses, and a long description — because
 * a sample that only shows the easy path hides the layout problems.
 *
 * A US contractor invoicing services usually has NO tax line; the non-round
 * rate here exists to exercise tax rendering and rounding, not to suggest a
 * default. Leave `taxRate` at 0 on a client unless they actually owe tax.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const repoRoot = resolve(webRoot, '../..');

// The template is JSX; reuse the test loader's SWC transform.
register(
  pathToFileURL(resolve(webRoot, 'test/loader.mjs')).href,
  pathToFileURL(`${webRoot}/`).href,
);

const { renderInvoicePdf } = await import(
  pathToFileURL(resolve(webRoot, 'src/lib/invoice-pdf.tsx')).href
);

export const SAMPLE = {
  invoiceNumber: 'INV-0042',
  status: 'sent',
  issueDate: '2026-09-11',
  dueDate: '2026-10-11',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  currency: 'USD',
  subtotal: 6262.5,
  taxRate: 8.25,
  taxAmount: 516.66,
  total: 6779.16,
  notes: 'Thanks for a great quarter.',
  // Bank details belong on the invoice document, never in the email body.
  payment: {
    title: 'USD ACH',
    fields: [
      { label: 'Account holder', value: 'Blake Eriks' },
      { label: 'Bank', value: 'First Republic Bank' },
      { label: 'Account number', value: '1234567890' },
      { label: 'Routing number (ACH)', value: '021000021' },
      { label: 'Account type', value: 'Checking' },
      { label: 'Payment reference', value: 'INV-0042' },
    ],
    intermediary: [],
    link: null,
    notes: 'Please email remittance advice to blake@example.dev.',
  },
  paymentNotice:
    'Our payment details never change. If you receive any message stating otherwise, call to verify before paying.',
  paymentTerms: 'Net 30',
  business: {
    name: 'Blake Eriks',
    address: '1847 Clement Street\nSan Francisco, CA 94121\nUnited States',
    email: 'blake@example.dev',
    logoUrl: null,
    taxId: 'EIN 88-4471992',
  },
  client: {
    name: 'Northwind Trading Co.',
    email: 'ap@northwind.example',
    address: '1 Harbour Street\nSeattle, WA 98104\nUnited States',
  },
  lineItems: [
    {
      description: 'Onboarding email sequence rework',
      quantityHours: 12.25,
      resolvedRate: 175,
      amount: 2143.75,
    },
    {
      description: 'Checkout validation fixes (Safari)',
      quantityHours: 8.5,
      resolvedRate: 175,
      amount: 1487.5,
    },
    {
      description: 'Design review + component pass',
      quantityHours: 6.0,
      resolvedRate: 175,
      amount: 1050.0,
    },
    // A different rate on the same invoice: these must not merge with the
    // 175/h lines above.
    {
      description: 'Q4 retainer scoping call',
      quantityHours: 1.75,
      resolvedRate: 220,
      amount: 385.0,
    },
    {
      description: 'Performance profiling, product listing pages',
      quantityHours: 7.4,
      resolvedRate: 160,
      amount: 1184.0,
    },
  ],
};

const outDir = resolve(repoRoot, 'docs/design/samples');
mkdirSync(outDir, { recursive: true });

const bytes = await renderInvoicePdf(SAMPLE);
const outFile = resolve(outDir, 'invoice-default.pdf');
writeFileSync(outFile, bytes);

console.log(`wrote ${outFile} (${bytes.length} bytes)`);
