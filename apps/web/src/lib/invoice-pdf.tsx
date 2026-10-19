import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from '@react-pdf/renderer';
import {
  formatCurrency,
  formatHours,
  formatQuantity,
  paginateSchedules,
  type DateRow,
  type DetailBlock,
  type ProjectRow,
  SCHEDULE_KINDS,
  SCHEDULE_TITLES,
  type ScheduleKind,
  type Schedules,
  type WeekRow,
} from '@stint/core';
import { print, theme } from '@stint/design-tokens';

/**
 * The invoice document, ink on white paper: the page has no background, so
 * the sheet is the printer's.
 *
 * The accent is read from the light theme because it is the brand mark, not
 * a surface: it appears once, on the amount due, the same scarcity rule the
 * app follows on screen.
 */
const accent = theme.light['accent-default'];

/**
 * The body text's size and line height, in points. The line height is
 * absolute because react-pdf resolves a unitless one against the font size of
 * the style that sets it, not of the text that inherits it.
 */
const FONT = 9.5;
const LINE = FONT * 1.5;
const LEADING = `${LINE}pt`;

/**
 * The printed page, in points. A detail page's row count is derived from it,
 * so a change here re-flows the detail pages rather than overflowing them.
 */
const PAGE = {
  // US Letter.
  size: { width: 612, height: 792 },
  margin: { top: 40, x: 44, bottom: 48 },
  // The footer's distance from the bottom edge, inside the bottom margin.
  footerInset: 24,
  detailRow: { padY: 3.5, rule: 0.5 },
  runHeader: { padBottom: 8, rule: 0.5, gap: 18 },
  tableGap: 18,
};

const detailRowHeight = 2 * PAGE.detailRow.padY + LINE + PAGE.detailRow.rule;
const runHeaderHeight =
  LINE + PAGE.runHeader.padBottom + PAGE.runHeader.rule + PAGE.runHeader.gap;

/**
 * One-line rows that fit a detail page under its running header.
 * `paginateSchedules` charges a table's headings and total one row each, but
 * not the gap under it, so the gap is reserved for every table a page can
 * hold.
 */
export const DETAIL_ROWS_PER_PAGE = Math.floor(
  (PAGE.size.height -
    PAGE.margin.top -
    PAGE.margin.bottom -
    runHeaderHeight -
    SCHEDULE_KINDS.length * PAGE.tableGap) /
    detailRowHeight,
);

const styles = StyleSheet.create({
  /* Line height is set on each section, never on the page: react-pdf
     re-resolves the page-number Text's styles on every page and multiplies a
     line height inherited from the page by the font size each time, in any
     unit, until the footer is drawn far above the page. */
  page: {
    paddingTop: PAGE.margin.top,
    paddingHorizontal: PAGE.margin.x,
    paddingBottom: PAGE.margin.bottom,
    fontSize: FONT,
    fontFamily: 'Helvetica',
    color: print.ink,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    lineHeight: LEADING,
  },
  logo: { width: 108, height: 36, objectFit: 'contain', marginBottom: 8 },
  bizName: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  bizLine: { color: print.muted, fontSize: 9 },

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
    color: print.muted,
    marginTop: 5,
  },

  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    lineHeight: LEADING,
  },
  metaCol: { maxWidth: '46%' },
  label: {
    fontSize: 7.5,
    letterSpacing: 1.1,
    color: print.faint,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  strong: { fontFamily: 'Helvetica-Bold' },
  datesRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 28 },
  dateCell: { alignItems: 'flex-end' },

  tHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: print.ink,
    paddingBottom: 6,
    marginBottom: 2,
    lineHeight: LEADING,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 5.5,
    borderBottomWidth: 0.5,
    borderBottomColor: print.rule,
    lineHeight: LEADING,
  },
  cDesc: { flex: 1, paddingRight: 12 },
  cQty: { width: 62, textAlign: 'right', fontFamily: 'Courier' },
  cRate: { width: 74, textAlign: 'right', fontFamily: 'Courier' },
  cAmt: { width: 86, textAlign: 'right', fontFamily: 'Courier' },
  /* An expense's date spans the quantity and rate columns it has no use
     for: at the quantity's width alone, a full date wraps. */
  cDate: { width: 136, textAlign: 'right', fontFamily: 'Courier' },
  headCell: {
    fontSize: 7.5,
    letterSpacing: 1.1,
    color: print.faint,
    fontFamily: 'Helvetica-Bold',
  },

  totals: { marginTop: 12, alignItems: 'flex-end', lineHeight: LEADING },
  totalRow: {
    flexDirection: 'row',
    width: 250,
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  grand: {
    flexDirection: 'row',
    width: 250,
    justifyContent: 'space-between',
    marginTop: 7,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: print.ink,
  },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  grandValue: { fontSize: 13, fontFamily: 'Courier-Bold', color: accent },

  notes: {
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: print.rule,
    lineHeight: LEADING,
  },
  // After the payment block, the block itself provides the separation.
  notesAfterPay: { marginTop: 12, paddingTop: 0, borderTopWidth: 0 },
  notesBody: { color: print.muted },

  // Payment block. A filled ground rather than a rule, because this is the
  // one section a payer hunts for on the page. Faint ink is too light for
  // the band, so its quiet text is muted.
  pay: {
    marginTop: 16,
    padding: 11,
    backgroundColor: print.band,
    borderLeftWidth: 2,
    borderLeftColor: print.ink,
    lineHeight: LEADING,
  },
  payTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, marginBottom: 7 },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  payCell: { width: '33.33%', paddingRight: 10, marginBottom: 5 },
  payLabel: {
    fontSize: 7,
    letterSpacing: 0.9,
    color: print.muted,
    fontFamily: 'Helvetica-Bold',
  },
  payValue: { fontFamily: 'Courier', fontSize: 9, lineHeight: 1.3 },
  paySub: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: print.rule,
  },
  payNotes: { marginTop: 8, fontSize: 8.5, color: print.muted },
  payLink: {
    marginTop: 8,
    fontSize: 9,
    color: accent,
    fontFamily: 'Helvetica-Bold',
  },
  // Deliberately quiet: a warning that shouts gets tuned out, and this one
  // needs to still read as normal on the hundredth invoice.
  notice: { marginTop: 10, fontSize: 7.5, color: print.muted, lineHeight: 1.4 },

  footer: {
    position: 'absolute',
    bottom: PAGE.footerInset,
    left: PAGE.margin.x,
    right: PAGE.margin.x,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: print.faint,
  },

  // Supporting detail. Every row is one line, so a page holds a known number
  // of them and `paginateSchedules` can decide the breaks.
  run: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: PAGE.runHeader.padBottom,
    marginBottom: PAGE.runHeader.gap,
    borderBottomWidth: PAGE.runHeader.rule,
    borderBottomColor: print.rule,
    lineHeight: LEADING,
  },
  runTitle: { fontFamily: 'Helvetica-Bold' },
  runMeta: { color: print.muted, fontSize: 8.5 },
  schedule: { marginBottom: PAGE.tableGap, lineHeight: LEADING },
  scheduleTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  continued: { fontFamily: 'Helvetica-Oblique', color: print.muted },
  dRow: {
    flexDirection: 'row',
    paddingVertical: PAGE.detailRow.padY,
    borderBottomWidth: PAGE.detailRow.rule,
    borderBottomColor: print.rule,
  },
  dSum: {
    flexDirection: 'row',
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: print.ink,
    fontFamily: 'Helvetica-Bold',
  },
  cText: { flex: 1, paddingRight: 12, maxLines: 1, textOverflow: 'ellipsis' },
  cDay: { width: 44 },
  cWhen: { width: 96 },
  cHours: { width: 62, textAlign: 'right', fontFamily: 'Courier' },

  voidMark: {
    position: 'absolute',
    top: 300,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 76,
    fontFamily: 'Helvetica-Bold',
    color: print.void,
    opacity: 0.12,
    letterSpacing: 10,
    lineHeight: LEADING,
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
  /** Reimbursed expenses, never taxed; 0 when there are none. */
  expensesSubtotal: number;
  total: number;
  notes: string | null;
  paymentTerms: string | null;
  /** The PO, contract or SOW; null when none. */
  reference?: string | null;
  business: {
    name: string | null;
    address: string | null;
    email: string | null;
    logoUrl: string | null;
  };
  client: { name: string; email: string | null; address: string | null };
  lineItems: Array<{
    description: string;
    unit: 'hour' | 'fixed' | 'expense';
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
    /** The day an expense was paid; expense lines only. */
    spentOn?: string | null;
  }>;
  /** Frozen payment snapshot from the invoice; null when none was set. */
  payment?: {
    title: string | null;
    fields: Array<{ label: string; value: string }>;
    intermediary: Array<{ label: string; value: string }>;
    link: { label: string; url: string } | null;
    notes: string | null;
  } | null;
  /** Standing anti-fraud line, printed under the payment block. */
  paymentNotice?: string | null;
  /** The frozen supporting detail, printed from page 2; null when none. */
  supportingDetail?: Schedules | null;
}

const DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
});

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

type Data = InvoicePdfData;
type LineItem = Data['lineItems'][number];
type Payment = NonNullable<Data['payment']>;

function InvoiceDocument({ data }: { data: Data }) {
  const services = data.lineItems.filter((li) => li.unit !== 'expense');
  const expenses = data.lineItems.filter((li) => li.unit === 'expense');

  return (
    <Document
      title={data.invoiceNumber}
      author={data.business.name ?? undefined}
    >
      <Page size={PAGE.size} style={styles.page}>
        {data.status === 'void' && <Text style={styles.voidMark}>VOID</Text>}
        <Letterhead data={data} />
        <BillTo data={data} />
        <ServiceLines items={services} currency={data.currency} />
        <ExpenseLines items={expenses} currency={data.currency} />
        <Totals
          data={data}
          hasServices={services.length > 0}
          hasExpenses={expenses.length > 0}
        />
        {data.payment ? (
          <PaymentBlock payment={data.payment} notice={data.paymentNotice} />
        ) : null}
        <Notes notes={data.notes} afterPay={Boolean(data.payment)} />
        <Footer number={data.invoiceNumber} />
      </Page>

      {/* Each detail page is a page of its own, so the detail starts on page
          2 however much room page 1 has left, and never sums into it. */}
      {data.supportingDetail
        ? paginateSchedules(data.supportingDetail, DETAIL_ROWS_PER_PAGE).map(
            (blocks, i) => <DetailPage key={i} data={data} blocks={blocks} />,
          )
        : null}
    </Document>
  );
}

function Letterhead({ data }: { data: Data }) {
  const { business } = data;
  return (
    <View style={styles.header}>
      <View style={{ maxWidth: '55%' }}>
        {business.logoUrl ? (
          <Image src={business.logoUrl} style={styles.logo} />
        ) : null}
        <Text style={styles.bizName}>{business.name ?? 'Invoice'}</Text>
        <Lines text={business.address} style={styles.bizLine} />
        {business.email ? (
          <Text style={styles.bizLine}>{business.email}</Text>
        ) : null}
      </View>

      <View>
        <Text style={styles.title}>INVOICE</Text>
        <Text style={styles.number}>{data.invoiceNumber}</Text>
      </View>
    </View>
  );
}

function BillTo({ data }: { data: Data }) {
  return (
    <View style={styles.meta}>
      <View style={styles.metaCol}>
        <Text style={styles.label}>BILL TO</Text>
        <Text style={styles.strong}>{data.client.name}</Text>
        <Lines text={data.client.address} style={styles.bizLine} />
        {data.client.email ? (
          <Text style={styles.bizLine}>{data.client.email}</Text>
        ) : null}
      </View>
      <Dates data={data} />
    </View>
  );
}

function Dates({ data }: { data: Data }) {
  return (
    <View>
      <View style={styles.datesRow}>
        <View style={styles.dateCell}>
          <Text style={styles.label}>ISSUED</Text>
          <Text>{date(data.issueDate)}</Text>
        </View>
        <View style={styles.dateCell}>
          <Text style={styles.label}>DUE</Text>
          <Text style={data.dueDate ? styles.strong : undefined}>
            {date(data.dueDate)}
          </Text>
        </View>
      </View>
      {data.periodStart && data.periodEnd ? (
        <View style={[styles.dateCell, { marginTop: 12 }]}>
          <Text style={styles.label}>SERVICE PERIOD</Text>
          <Text style={styles.bizLine}>
            {date(data.periodStart)} – {date(data.periodEnd)}
          </Text>
        </View>
      ) : null}
      {/* What accounts payable matches the invoice to. */}
      {data.reference ? (
        <View style={[styles.dateCell, { marginTop: 10 }]}>
          <Text style={styles.label}>REFERENCE</Text>
          <Text style={[styles.bizLine, { maxWidth: 240, textAlign: 'right' }]}>
            {data.reference}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ServiceLines({
  items,
  currency,
}: {
  items: LineItem[];
  currency: string;
}) {
  return (
    <>
      <View style={styles.tHead}>
        <Text style={[styles.cDesc, styles.headCell]}>DESCRIPTION</Text>
        <Text style={[styles.cQty, styles.headCell]}>QTY</Text>
        <Text style={[styles.cRate, styles.headCell]}>RATE</Text>
        <Text style={[styles.cAmt, styles.headCell]}>AMOUNT</Text>
      </View>
      {items.map((li, i) => (
        <View key={i} style={styles.row} wrap={false}>
          <Text style={styles.cDesc}>{li.description}</Text>
          <Text style={styles.cQty}>
            {formatQuantity(li.unit, li.quantity ?? 0)}
          </Text>
          <Text style={styles.cRate}>
            {formatCurrency(li.unitPrice, currency)}
          </Text>
          <Text style={styles.cAmt}>{formatCurrency(li.amount, currency)}</Text>
        </View>
      ))}
    </>
  );
}

/**
 * Reimbursements follow the services under their own heading, so a client's
 * accounts team can see what is pass-through. The date takes the quantity's
 * place: an expense is one of something, and when it was paid is what a
 * reviewer checks it against.
 */
function ExpenseLines({
  items,
  currency,
}: {
  items: LineItem[];
  currency: string;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <View style={[styles.tHead, { marginTop: 14 }]} wrap={false}>
        <Text style={[styles.cDesc, styles.headCell]}>EXPENSES</Text>
        <Text style={[styles.cDate, styles.headCell]}>DATE</Text>
        <Text style={[styles.cAmt, styles.headCell]}>AMOUNT</Text>
      </View>
      {items.map((li, i) => (
        <View key={i} style={styles.row} wrap={false}>
          <Text style={styles.cDesc}>{li.description}</Text>
          <Text style={styles.cDate}>{date(li.spentOn ?? null)}</Text>
          <Text style={styles.cAmt}>{formatCurrency(li.amount, currency)}</Text>
        </View>
      ))}
    </>
  );
}

function Totals({
  data,
  hasServices,
  hasExpenses,
}: {
  data: Data;
  hasServices: boolean;
  hasExpenses: boolean;
}) {
  const cur = data.currency;
  return (
    <View style={styles.totals}>
      {/* An invoice of expenses alone has no services to subtotal. */}
      {hasServices || !hasExpenses ? (
        <TotalRow
          label={hasExpenses ? 'Services' : 'Subtotal'}
          value={formatCurrency(data.subtotal, cur)}
        />
      ) : null}
      {data.taxRate > 0 ? (
        <TotalRow
          label={`Tax (${data.taxRate}%)`}
          value={formatCurrency(data.taxAmount, cur)}
        />
      ) : null}
      {hasExpenses ? (
        <TotalRow
          label="Expenses"
          value={formatCurrency(data.expensesSubtotal, cur)}
        />
      ) : null}

      <View style={styles.grand}>
        <Text style={styles.grandLabel}>Amount due</Text>
        <Text style={styles.grandValue}>{formatCurrency(data.total, cur)}</Text>
      </View>

      {data.paymentTerms ? (
        <Text style={{ color: print.faint, marginTop: 6, fontSize: 8.5 }}>
          {data.paymentTerms}
        </Text>
      ) : null}
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={{ color: print.muted }}>{label}</Text>
      <Text style={{ fontFamily: 'Courier' }}>{value}</Text>
    </View>
  );
}

function PaymentBlock({
  payment,
  notice,
}: {
  payment: Payment;
  notice: string | null | undefined;
}) {
  return (
    <View style={styles.pay} wrap={false}>
      <Text style={styles.payTitle}>
        {payment.title ? `Payment — ${payment.title}` : 'Payment details'}
      </Text>
      <PayGrid fields={payment.fields} />
      {payment.intermediary.length > 0 ? (
        <PayGrid fields={payment.intermediary} style={styles.paySub} />
      ) : null}
      {payment.link ? (
        <Text style={styles.payLink}>
          {payment.link.label}: {payment.link.url}
        </Text>
      ) : null}
      <Lines text={payment.notes} style={styles.payNotes} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

function PayGrid({
  fields,
  style,
}: {
  fields: Payment['fields'];
  style?: TextStyle;
}) {
  return (
    <View style={style ? [styles.payGrid, style] : styles.payGrid}>
      {fields.map((f, i) => (
        <View key={i} style={styles.payCell}>
          <Text style={styles.payLabel}>{f.label.toUpperCase()}</Text>
          <Text style={styles.payValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

function Notes({
  notes,
  afterPay,
}: {
  notes: string | null;
  afterPay: boolean;
}) {
  if (!notes) return null;
  return (
    <View
      style={afterPay ? [styles.notes, styles.notesAfterPay] : styles.notes}
    >
      <Text style={styles.label}>NOTES</Text>
      <Lines text={notes} style={styles.notesBody} />
    </View>
  );
}

function DetailPage({ data, blocks }: { data: Data; blocks: DetailBlock[] }) {
  return (
    <Page size={PAGE.size} style={styles.page}>
      <View style={styles.run}>
        <Text style={styles.runTitle}>Supporting detail</Text>
        <Text style={styles.runMeta}>
          {data.invoiceNumber} · {data.client.name} · {date(data.periodStart)} –{' '}
          {date(data.periodEnd)}
        </Text>
      </View>
      {blocks.map((block, j) => (
        <ScheduleTable key={j} block={block} />
      ))}
      <Footer number={data.invoiceNumber} />
    </Page>
  );
}

function Footer({ number }: { number: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{number}</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ''
        }
      />
    </View>
  );
}

/** Hours only: a schedule shows how the time was spent, never what it cost. */
function ScheduleTable({ block }: { block: DetailBlock }) {
  const head = (text: string, style: TextStyle) => (
    <Text style={[style, styles.headCell]}>{text}</Text>
  );
  return (
    <View style={styles.schedule}>
      <Text style={styles.scheduleTitle}>
        {SCHEDULE_TITLES[block.kind]}
        {block.continued ? (
          <Text style={styles.continued}> (continued)</Text>
        ) : null}
      </Text>
      <View style={styles.tHead}>
        {block.kind === 'date' ? (
          <>
            {head('DATE', styles.cWhen)}
            {head('DAY', styles.cDay)}
          </>
        ) : null}
        {head(block.kind === 'week' ? 'WEEK' : 'PROJECT', styles.cText)}
        {head('HOURS', styles.cHours)}
      </View>
      {block.rows.map((row, i) => (
        <View key={i} style={styles.dRow}>
          <ScheduleCells kind={block.kind} row={row} />
          <Text style={styles.cHours}>{formatHours(row.hours)}</Text>
        </View>
      ))}
      {block.total !== null ? (
        <View style={styles.dSum}>
          <Text style={styles.cText}>Total</Text>
          <Text style={styles.cHours}>{formatHours(block.total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleCells({
  kind,
  row,
}: {
  kind: ScheduleKind;
  row: DetailBlock['rows'][number];
}) {
  if (kind === 'project')
    return <Text style={styles.cText}>{(row as ProjectRow).project}</Text>;
  if (kind === 'week') {
    const w = row as WeekRow;
    return (
      <Text style={styles.cText}>
        {date(w.start)} – {date(w.end)}
      </Text>
    );
  }
  const d = row as DateRow;
  return (
    <>
      <Text style={styles.cWhen}>{date(d.date)}</Text>
      <Text style={styles.cDay}>
        {DAY.format(new Date(`${d.date}T00:00:00Z`))}
      </Text>
      <Text style={styles.cText}>{d.project}</Text>
    </>
  );
}

/**
 * Renders the invoice to PDF bytes.
 *
 * Lives here, in the .tsx module, so the route handlers stay plain .ts —
 * Node's type-stripping test runner cannot transform JSX, and keeping the
 * JSX behind this function means the routes remain directly testable.
 */
export async function renderInvoicePdf(
  data: InvoicePdfData,
): Promise<Uint8Array> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const buffer = await renderToBuffer(<InvoiceDocument data={data} />);
  return new Uint8Array(buffer);
}
