import { Document, Page, Text, View } from '@react-pdf/renderer';
import { paginateSchedules } from '@stint/core';
import type { InvoiceTemplate } from '@stint/schema';
import { registerFonts } from './invoice-templates/fonts';
import {
  PAGE_SIZE,
  type Data,
  type Template,
} from './invoice-templates/shared';
import { standard } from './invoice-templates/standard';
import { modern } from './invoice-templates/modern';
import { classic } from './invoice-templates/classic';
import { creative } from './invoice-templates/creative';

const TEMPLATES: Record<InvoiceTemplate, Template> = {
  standard,
  modern,
  classic,
  creative,
};

/** One-line rows a detail page holds in `template`. */
export const detailRowsPerPage = (template: InvoiceTemplate) =>
  TEMPLATES[template].rowsPerPage;

/**
 * The invoice document, ink on white paper: the page has no background, so
 * the sheet is the printer's. The template draws each page's content; this
 * shell draws what every template keeps, so none can drop it.
 */
function InvoiceDocument({ data }: { data: Data }) {
  const t = TEMPLATES[data.template];
  const footer = (
    <View style={t.footer} fixed>
      <Text>{data.invoiceNumber}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ''
        }
      />
    </View>
  );

  return (
    <Document
      title={data.invoiceNumber}
      author={data.business.name ?? undefined}
    >
      <Page size={PAGE_SIZE} style={t.page}>
        {data.status === 'void' && <Text style={t.voidMark}>VOID</Text>}
        <t.First data={data} />
        {footer}
      </Page>

      {/* Each detail page is a page of its own, so the detail starts on page
          2 however much room page 1 has left, and never sums into it. */}
      {data.supportingDetail
        ? paginateSchedules(data.supportingDetail, t.rowsPerPage).map(
            (blocks, i) => (
              <Page key={i} size={PAGE_SIZE} style={t.page}>
                <t.Detail data={data} blocks={blocks} />
                {footer}
              </Page>
            ),
          )
        : null}
    </Document>
  );
}

/**
 * Renders the invoice to PDF bytes.
 *
 * Lives here, in the .tsx module, so the route handlers stay plain .ts —
 * Node's type-stripping test runner cannot transform JSX, and keeping the
 * JSX behind this function means the routes remain directly testable.
 */
export async function renderInvoicePdf(data: Data): Promise<Uint8Array> {
  registerFonts();
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const buffer = await renderToBuffer(<InvoiceDocument data={data} />);
  return new Uint8Array(buffer);
}
