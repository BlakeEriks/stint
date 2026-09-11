import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

/**
 * The invoice document.
 *
 * Colors are the design system's LIGHT theme, not the dark UI one: this is
 * ink on white paper. The accent appears once, on the amount due — the same
 * scarcity rule the app follows on screen.
 */
const c = {
  ink: '#21242B',       // ln-850
  muted: '#565C67',     // ln-600
  faint: '#8B919D',     // ln-400
  rule: '#D1D5DD',      // ln-100
  band: '#F2F3F6',      // ln-25
  accent: '#1F7E17',    // light-mode accent
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 48,
    paddingBottom: 64,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: c.ink,
    lineHeight: 1.5,
  },

  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
  logo: { width: 108, height: 36, objectFit: 'contain', marginBottom: 8 },
  bizName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  bizLine: { color: c.muted, fontSize: 9 },

  title: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    letterSpacing: -0.4,
    lineHeight: 1.15,
  },
  number: {
    fontSize: 11,
    fontFamily: 'Courier',
    textAlign: 'right',
    color: c.muted,
    marginTop: 5,
  },

  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  metaCol: { maxWidth: '46%' },
  label: {
    fontSize: 7.5,
    letterSpacing: 1.1,
    color: c.faint,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  strong: { fontFamily: 'Helvetica-Bold' },
  datesRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 28 },
  dateCell: { alignItems: 'flex-end' },

  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: c.ink,
    paddingBottom: 6,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: c.rule,
  },
  cDesc: { flex: 1, paddingRight: 12 },
  cQty: { width: 62, textAlign: 'right', fontFamily: 'Courier' },
  cRate: { width: 74, textAlign: 'right', fontFamily: 'Courier' },
  cAmt: { width: 86, textAlign: 'right', fontFamily: 'Courier' },
  headCell: { fontSize: 7.5, letterSpacing: 1.1, color: c.faint, fontFamily: 'Helvetica-Bold' },

  totals: { marginTop: 18, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: 250, justifyContent: 'space-between', paddingVertical: 3 },
  grand: {
    flexDirection: 'row',
    width: 250,
    justifyContent: 'space-between',
    marginTop: 7,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: c.ink,
  },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 13, fontFamily: 'Courier-Bold', color: c.accent },

  notes: { marginTop: 32, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: c.rule },
  notesBody: { color: c.muted },

  footer: {
    position: 'absolute',
    bottom: 32,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: c.faint,
  },

  voidMark: {
    position: 'absolute',
    top: 300,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 76,
    fontFamily: 'Helvetica-Bold',
    color: '#E9504D',
    opacity: 0.12,
    letterSpacing: 10,
  },
});

export interface InvoicePdfData {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  paymentTerms: string | null;
  business: {
    name: string | null;
    address: string | null;
    email: string | null;
    logoUrl: string | null;
    taxId: string | null;
  };
  client: { name: string; email: string | null; address: string | null };
  lineItems: Array<{
    description: string;
    quantityHours: number;
    resolvedRate: number | null;
    amount: number | null;
  }>;
}

const money = (n: number | null, currency: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    currencyDisplay: 'narrowSymbol',
  }).format(n ?? 0);

const date = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

// `Text` has an SVG overload, so ComponentProps yields a union. Reuse the
// exact style type the stylesheet produces instead.
type TextStyle = (typeof styles)[keyof typeof styles];

/** Multi-line address text without relying on newlines surviving layout. */
function Lines({ text, style }: { text: string | null; style?: TextStyle }) {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Text key={i} style={style}>
          {line}
        </Text>
      ))}
    </>
  );
}

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const cur = data.currency;

  return (
    <Document title={data.invoiceNumber} author={data.business.name ?? undefined}>
      <Page size="A4" style={styles.page}>
        {data.status === 'void' && <Text style={styles.voidMark}>VOID</Text>}

        <View style={styles.header}>
          <View style={{ maxWidth: '55%' }}>
            {data.business.logoUrl ? <Image src={data.business.logoUrl} style={styles.logo} /> : null}
            <Text style={styles.bizName}>{data.business.name ?? 'Invoice'}</Text>
            <Lines text={data.business.address} style={styles.bizLine} />
            {data.business.email ? <Text style={styles.bizLine}>{data.business.email}</Text> : null}
            {data.business.taxId ? (
              <Text style={styles.bizLine}>Tax ID {data.business.taxId}</Text>
            ) : null}
          </View>

          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.number}>{data.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.meta}>
          <View style={styles.metaCol}>
            <Text style={styles.label}>BILL TO</Text>
            <Text style={styles.strong}>{data.client.name}</Text>
            <Lines text={data.client.address} style={styles.bizLine} />
            {data.client.email ? <Text style={styles.bizLine}>{data.client.email}</Text> : null}
          </View>

          <View>
            <View style={styles.datesRow}>
              <View style={styles.dateCell}>
                <Text style={styles.label}>ISSUED</Text>
                <Text>{date(data.issueDate)}</Text>
              </View>
              <View style={styles.dateCell}>
                <Text style={styles.label}>DUE</Text>
                <Text style={data.dueDate ? styles.strong : undefined}>{date(data.dueDate)}</Text>
              </View>
            </View>
            {data.periodStart && data.periodEnd ? (
              <View style={[styles.dateCell, { marginTop: 12 }]}>
                <Text style={styles.label}>PERIOD</Text>
                <Text style={styles.bizLine}>
                  {date(data.periodStart)} – {date(data.periodEnd)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.tHead}>
          <Text style={[styles.cDesc, styles.headCell]}>DESCRIPTION</Text>
          <Text style={[styles.cQty, styles.headCell]}>HOURS</Text>
          <Text style={[styles.cRate, styles.headCell]}>RATE</Text>
          <Text style={[styles.cAmt, styles.headCell]}>AMOUNT</Text>
        </View>

        {data.lineItems.map((li, i) => (
          <View key={i} style={styles.row} wrap={false}>
            <Text style={styles.cDesc}>{li.description}</Text>
            <Text style={styles.cQty}>{li.quantityHours.toFixed(2)}</Text>
            <Text style={styles.cRate}>{money(li.resolvedRate, cur)}</Text>
            <Text style={styles.cAmt}>{money(li.amount, cur)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={{ color: c.muted }}>Subtotal</Text>
            <Text style={{ fontFamily: 'Courier' }}>{money(data.subtotal, cur)}</Text>
          </View>

          {data.taxRate > 0 ? (
            <View style={styles.totalRow}>
              <Text style={{ color: c.muted }}>Tax ({data.taxRate}%)</Text>
              <Text style={{ fontFamily: 'Courier' }}>{money(data.taxAmount, cur)}</Text>
            </View>
          ) : null}

          <View style={styles.grand}>
            <Text style={styles.grandLabel}>Amount due</Text>
            <Text style={styles.grandValue}>{money(data.total, cur)}</Text>
          </View>

          {data.paymentTerms ? (
            <Text style={{ color: c.faint, marginTop: 6, fontSize: 8.5 }}>
              {data.paymentTerms}
            </Text>
          ) : null}
        </View>

        {data.notes ? (
          <View style={styles.notes}>
            <Text style={styles.label}>NOTES</Text>
            <Lines text={data.notes} style={styles.notesBody} />
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{data.invoiceNumber}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ''
            }
          />
        </View>
      </Page>
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
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const buffer = await renderToBuffer(<InvoiceDocument data={data} />);
  return new Uint8Array(buffer);
}
