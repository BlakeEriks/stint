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
  notes:
    'Wire transfer preferred — bank details on request.\nThanks for a great quarter.',
  paymentTerms: 'Net 30',
  business: {
    name: 'Blake Eriks',
    address: '104 Rua das Laranjeiras\nRio de Janeiro, RJ 22240-003\nBrazil',
    email: 'blake@example.dev',
    logoUrl: null,
    taxId: 'BR-4471-9920',
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
