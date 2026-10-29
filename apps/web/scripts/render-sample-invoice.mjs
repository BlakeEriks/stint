/**
 * Renders a sample invoice in each template to `docs/design/samples/`, and
 * its first page to the template picker's thumbnail and preview (needs
 * poppler's `pdftoppm`), so what the picker shows is the PDF.
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
import { execFileSync } from 'node:child_process';

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
  subtotal: 4212.75,
  taxRate: 8.25,
  taxAmount: 347.55,
  expensesSubtotal: 84,
  total: 4644.3,
  notes: 'Thanks for a great quarter.',
  // Bank details belong on the invoice document, never in the email body.
  payment: {
    title: 'USD ACH',
    fields: [
      { label: 'Account holder', value: 'Sam Rivera' },
      { label: 'Bank', value: 'First Republic Bank' },
      { label: 'Account number', value: '1234567890' },
      { label: 'Routing number (ACH)', value: '021000021' },
      { label: 'Account type', value: 'Checking' },
      { label: 'Payment reference', value: 'INV-0042' },
    ],
    intermediary: [],
    link: null,
    notes: 'Please email remittance advice to sam@example.dev.',
  },
  paymentTerms: 'Net 30',
  business: {
    name: 'Sam Rivera',
    address: '1847 Clement Street\nSan Francisco, CA 94121\nUnited States',
    email: 'sam@example.dev',
    logoUrl: null,
  },
  client: {
    name: 'Northwind Trading Co.',
    email: 'ap@northwind.example',
    address: '1 Harbour Street\nSeattle, WA 98104\nUnited States',
  },
  lineItems: [
    {
      description: 'Onboarding email sequence rework',
      unit: 'hour',
      quantity: 12.25,
      unitPrice: 175,
      amount: 2143.75,
    },
    // A different rate on the same invoice: these must not merge with the
    // 175/h lines above.
    {
      description: 'Q4 retainer scoping call',
      unit: 'hour',
      quantity: 1.75,
      unitPrice: 220,
      amount: 385.0,
    },
    {
      description: 'Performance profiling, product listing pages',
      unit: 'hour',
      quantity: 7.4,
      unitPrice: 160,
      amount: 1184.0,
    },
    // Each kind of line, so every template shows how it sets them apart.
    {
      description: 'Monthly retainer',
      unit: 'fixed',
      quantity: 1,
      unitPrice: 500,
      amount: 500,
    },
    {
      description: 'Hosting, September',
      unit: 'expense',
      quantity: 1,
      unitPrice: 84,
      amount: 84,
      spentOn: '2026-09-12',
    },
  ],
  reference: 'ICA dated Aug 5, 2026 · Exhibit A SOW',
  // Long enough that the date table continues onto a third page.
  supportingDetail: {
    project: [
      { project: 'Checkout', hours: 21.6 },
      { project: 'Onboarding', hours: 14 },
    ],
    week: [
      { start: '2026-09-01', end: '2026-09-06', hours: 9 },
      { start: '2026-09-07', end: '2026-09-13', hours: 11.5 },
      { start: '2026-09-14', end: '2026-09-20', hours: 6.85 },
      { start: '2026-09-21', end: '2026-09-27', hours: 6.25 },
      { start: '2026-09-28', end: '2026-09-30', hours: 2 },
    ],
    date: Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      project: i % 3 ? 'Checkout' : 'Onboarding',
      hours: 1.19,
    })),
    totalHours: 35.6,
  },
};

const outDir = resolve(repoRoot, 'docs/design/samples');
const thumbDir = resolve(webRoot, 'src/components/template-thumbs');
mkdirSync(outDir, { recursive: true });

for (const template of ['standard', 'modern', 'classic', 'creative']) {
  const bytes = await renderInvoicePdf({ ...SAMPLE, template });
  const outFile = resolve(outDir, `invoice-${template}.pdf`);
  writeFileSync(outFile, bytes);
  console.log(`wrote ${outFile} (${bytes.length} bytes)`);
  // Twice the page's width in points, sharp in the full-size preview.
  execFileSync('pdftoppm', [
    '-png',
    '-singlefile',
    '-f',
    '1',
    '-scale-to-x',
    '1224',
    '-scale-to-y',
    '-1',
    outFile,
    resolve(thumbDir, template),
  ]);
  // The thumbnail is page 1, so the whole invoice must fit on it: a payment
  // block pushed to page 2 would vanish from the picker.
  const page1 = execFileSync(
    'pdftotext',
    ['-f', '1', '-l', '1', outFile, '-'],
    {
      encoding: 'utf8',
    },
  );
  if (!page1.includes('021000021'))
    throw new Error(`${template}: payment details are not on page 1`);
}
