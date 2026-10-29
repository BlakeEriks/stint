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

/* September's days, which the project and week schedules sum: Onboarding
   every third day, Checkout the rest. */
const DAYS = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  project: i % 3 ? 'Checkout' : 'Onboarding',
  hours: i % 3 ? 0.4 : 1.25,
}));
const WEEKS = [
  ['2026-09-01', '2026-09-06'],
  ['2026-09-07', '2026-09-13'],
  ['2026-09-14', '2026-09-20'],
  ['2026-09-21', '2026-09-27'],
  ['2026-09-28', '2026-09-30'],
];
// In hundredths, so the week totals print as the dates add up.
const sum = (days) =>
  days.reduce((n, d) => n + Math.round(d.hours * 100), 0) / 100;

export const SAMPLE = {
  invoiceNumber: 'INV-0042',
  status: 'sent',
  issueDate: '2026-09-11',
  dueDate: '2026-10-11',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  currency: 'USD',
  subtotal: 3967.5,
  taxRate: 8.25,
  taxAmount: 327.32,
  expensesSubtotal: 84,
  total: 4378.82,
  notes: 'Thanks for a great quarter.',
  // Bank details belong on the invoice document, never in the email body.
  payment: {
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
    address: '1847 Clement Street\nSan Francisco, CA 94121',
    email: 'sam@example.dev',
    logoUrl: null,
  },
  client: {
    name: 'Northwind Trading Co.',
    email: 'ap@northwind.example',
    address: '1 Harbour Street\nSeattle, WA 98104',
  },
  lineItems: [
    {
      description: 'Onboarding email sequence rework',
      unit: 'hour',
      quantity: 12.5,
      unitPrice: 175,
      amount: 2187.5,
    },
    // A different rate on the same invoice: it must not merge with the
    // 175/h line above.
    {
      description: 'Performance profiling, product listing pages',
      unit: 'hour',
      quantity: 8,
      unitPrice: 160,
      amount: 1280.0,
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
      { project: 'Checkout', hours: 8 },
      { project: 'Onboarding', hours: 12.5 },
    ],
    week: WEEKS.map(([start, end]) => ({
      start,
      end,
      hours: sum(DAYS.filter((d) => d.date >= start && d.date <= end)),
    })),
    date: DAYS,
    totalHours: 20.5,
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
  // The thumbnail is page 1, so the whole invoice must fit on it: payment
  // details or notes pushed to page 2 would vanish from the picker.
  const page1 = execFileSync(
    'pdftotext',
    ['-f', '1', '-l', '1', outFile, '-'],
    {
      encoding: 'utf8',
    },
  );
  const routing = SAMPLE.payment.fields.find((f) =>
    f.label.startsWith('Routing'),
  ).value;
  for (const [what, text] of [
    ['payment details', routing],
    ['notes', SAMPLE.notes],
  ])
    if (!page1.includes(text))
      throw new Error(`${template}: the ${what} are not on page 1`);
}
