import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { formatCurrency, formatQuantity, type DetailBlock } from '@stint/core';
import { print } from '@stint/design-tokens';
import {
  date,
  DetailView,
  Lines,
  PaymentView,
  payStyles,
  period,
  split,
  TotalsView,
  type Data,
  type LineItem,
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

const M = { top: 40, right: 44, bottom: 48, left: 44 };
const ROW = { padY: 3.5, rule: 0.5 };
/** A detail page's running header: a line, the space over its rule, the
 *  rule and the space under it. */
const RUN = { pad: 8, rule: 0.5, after: 18 };
const GAP = 18;

const styles = StyleSheet.create({
  page: {
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
  tHeadCell: {
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
  grandValue: { fontSize: 13, fontFamily: 'Courier-Bold', color: print.accent },

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
    color: print.accent,
    fontFamily: 'Helvetica-Bold',
  },
  footer: { fontSize: 8, color: print.faint },

  // Supporting detail. Every row is one line, so a page holds a known number
  // of them and `paginateSchedules` can decide the breaks.
  run: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: RUN.pad,
    marginBottom: RUN.after,
    borderBottomWidth: RUN.rule,
    borderBottomColor: print.rule,
    lineHeight: LEADING,
  },
  runTitle: { fontFamily: 'Helvetica-Bold' },
  runMeta: { color: print.muted, fontSize: 8.5 },
  table: { marginBottom: GAP, lineHeight: LEADING },
  tTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  continued: { fontFamily: 'Helvetica-Oblique', color: print.muted },
  tRow: {
    flexDirection: 'row',
    paddingVertical: ROW.padY,
    borderBottomWidth: ROW.rule,
    borderBottomColor: print.rule,
  },
  tSum: {
    flexDirection: 'row',
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: print.ink,
    fontFamily: 'Helvetica-Bold',
  },
  tText: { flex: 1, paddingRight: 12, maxLines: 1, textOverflow: 'ellipsis' },
  tDay: { width: 44 },
  tWhen: { width: 96 },
  tHours: { width: 62, textAlign: 'right', fontFamily: 'Courier' },

  voidMark: { fontFamily: 'Helvetica-Bold', color: print.void },
});

/** Helvetica, Courier figures, the accent on the total. */
function First({ data }: { data: Data }) {
  const { services, expenses } = split(data);
  return (
    <>
      <Letterhead data={data} />
      <BillTo data={data} />
      <ServiceLines items={services} currency={data.currency} />
      <ExpenseLines items={expenses} currency={data.currency} />
      <TotalsView data={data} s={totals} />
      {data.payment ? (
        <PaymentView payment={data.payment} s={payStyles(styles)} />
      ) : null}
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
      {period(data) ? (
        <View style={[styles.dateCell, { marginTop: 12 }]}>
          <Text style={styles.label}>SERVICE PERIOD</Text>
          <Text style={styles.bizLine}>{period(data)}</Text>
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
        <Text style={[styles.cDesc, styles.tHeadCell]}>DESCRIPTION</Text>
        <Text style={[styles.cQty, styles.tHeadCell]}>QTY</Text>
        <Text style={[styles.cRate, styles.tHeadCell]}>RATE</Text>
        <Text style={[styles.cAmt, styles.tHeadCell]}>AMOUNT</Text>
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
        <Text style={[styles.cDesc, styles.tHeadCell]}>EXPENSES</Text>
        <Text style={[styles.cDate, styles.tHeadCell]}>DATE</Text>
        <Text style={[styles.cAmt, styles.tHeadCell]}>AMOUNT</Text>
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
  return <DetailView data={data} blocks={blocks} s={styles} />;
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

export const standard: Template = {
  page: styles.page,
  voidMark: styles.voidMark,
  footer: styles.footer,
  margin: M,
  detail: {
    header: LINE + RUN.pad + RUN.rule + RUN.after,
    tableGap: GAP,
    row: 2 * ROW.padY + LINE + ROW.rule,
  },
  First,
  Detail,
};
