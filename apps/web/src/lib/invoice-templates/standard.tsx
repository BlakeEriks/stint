import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatCurrency, formatQuantity, type DetailBlock } from '@stint/core';
import { print } from '@stint/design-tokens';
import {
  accent,
  date,
  Lines,
  PAGE_SIZE,
  PaymentView,
  rowsPerPage,
  runMeta,
  ScheduleView,
  TotalsView,
  type Data,
  type LineItem,
  type PaymentStyles,
  type ScheduleStyles,
  type Template,
  type TotalsStyles,
} from './shared';

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
  size: PAGE_SIZE,
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
const DETAIL_ROWS_PER_PAGE = rowsPerPage({
  top: PAGE.margin.top,
  bottom: PAGE.margin.bottom,
  header: runHeaderHeight,
  tableGap: PAGE.tableGap,
  row: detailRowHeight,
});

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

/** Helvetica, Courier figures, the accent on the total. */
function First({ data }: { data: Data }) {
  const services = data.lineItems.filter((li) => li.unit !== 'expense');
  const expenses = data.lineItems.filter((li) => li.unit === 'expense');
  return (
    <>
      <Letterhead data={data} />
      <BillTo data={data} />
      <ServiceLines items={services} currency={data.currency} />
      <ExpenseLines items={expenses} currency={data.currency} />
      <TotalsView data={data} s={totals} />
      {data.payment ? <PaymentView payment={data.payment} s={pay} /> : null}
      <Notes notes={data.notes} afterPay={Boolean(data.payment)} />
    </>
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

function Detail({ data, blocks }: { data: Data; blocks: DetailBlock[] }) {
  return (
    <>
      <View style={styles.run}>
        <Text style={styles.runTitle}>Supporting detail</Text>
        <Text style={styles.runMeta}>{runMeta(data)}</Text>
      </View>
      {blocks.map((block, j) => (
        <ScheduleView key={j} block={block} s={table} />
      ))}
    </>
  );
}

const totals: TotalsStyles = {
  box: styles.totals,
  row: styles.totalRow,
  label: { color: print.muted },
  value: { fontFamily: 'Courier' },
  grand: styles.grand,
  grandLabel: styles.grandLabel,
  grandValue: styles.grandValue,
  terms: { color: print.faint, marginTop: 6, fontSize: 8.5 },
};

const pay: PaymentStyles = {
  box: styles.pay,
  title: styles.payTitle,
  grid: styles.payGrid,
  cell: styles.payCell,
  label: styles.payLabel,
  value: styles.payValue,
  sub: styles.paySub,
  link: styles.payLink,
  notes: styles.payNotes,
};

const table: ScheduleStyles = {
  table: styles.schedule,
  title: styles.scheduleTitle,
  continued: styles.continued,
  head: styles.tHead,
  headCell: styles.headCell,
  row: styles.dRow,
  sum: styles.dSum,
  text: styles.cText,
  day: styles.cDay,
  when: styles.cWhen,
  hours: styles.cHours,
};

export const standard: Template = {
  page: styles.page,
  voidMark: styles.voidMark,
  footer: styles.footer,
  rowsPerPage: DETAIL_ROWS_PER_PAGE,
  First,
  Detail,
};
