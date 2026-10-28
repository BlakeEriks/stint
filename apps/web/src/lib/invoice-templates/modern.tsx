import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatQuantity, type DetailBlock } from '@stint/core';
import { print } from '@stint/design-tokens';
import {
  accent,
  date,
  Lines,
  money,
  PaymentView,
  period,
  rowsPerPage,
  DetailView,
  payStyles,
  split,
  TotalsView,
  type Data,
  type LineItem,
  type Template,
  type TotalsStyles,
} from './shared';

/*
 * Modern (specs/011-invoice-templates/design/invoice.html): one round face on
 * white, hierarchy by size and weight alone, hairlines, and every row spanning
 * the page. The accent marks the rule under the header and the amount due.
 */

const LINE = 14.5;
const M = { top: 46, x: 52, bottom: 52 };
const ROW = { padY: 5, rule: 0.5 };
const RUN = 28 + 14 + 1 + 22;
const GAP = 18;

const label = {
  fontSize: 7.5,
  letterSpacing: 1.2,
  fontWeight: 500,
  color: print.faint,
} as const;

const s = StyleSheet.create({
  // Line height is set on each section, never on the page: see standard.tsx.
  page: {
    paddingTop: M.top,
    paddingHorizontal: M.x,
    paddingBottom: M.bottom,
    fontFamily: 'Outfit',
    fontSize: 9.5,
    color: print.ink,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 16,
    lineHeight: `${LINE}pt`,
  },
  word: { fontSize: 34, fontWeight: 300, letterSpacing: -0.5, lineHeight: 1.1 },
  number: { color: print.muted, fontSize: 10, marginTop: 4 },
  from: { alignItems: 'flex-end', maxWidth: '50%' },
  logo: { width: 108, height: 36, objectFit: 'contain', marginBottom: 8 },
  biz: { fontSize: 12, fontWeight: 600, marginBottom: 2, textAlign: 'right' },
  muted: { color: print.muted },
  right: { textAlign: 'right' },
  rule: { height: 1, backgroundColor: print.rule, marginBottom: 20 },
  ruleAccent: {
    position: 'absolute',
    left: 0,
    top: -1,
    width: 56,
    height: 3,
    backgroundColor: accent,
  },
  label,
  info: { flexDirection: 'row', gap: 20, lineHeight: `${LINE}pt` },
  billTo: { flex: 1.6 },
  cell: { flex: 1 },
  due: { flex: 1.3, alignItems: 'flex-end' },
  amount: {
    fontSize: 22,
    fontWeight: 500,
    letterSpacing: -0.3,
    color: accent,
    lineHeight: 1.2,
  },
  strong: { fontWeight: 600 },
  info2: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: print.hairline,
    lineHeight: `${LINE}pt`,
  },
  info2Cell: { flexDirection: 'row', gap: 8, alignItems: 'baseline' },
  lines: { marginTop: 22, lineHeight: `${LINE}pt` },
  head: {
    flexDirection: 'row',
    paddingBottom: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: print.rule,
  },
  headGap: { marginTop: 16 },
  row: {
    flexDirection: 'row',
    paddingVertical: 6.5,
    borderBottomWidth: 0.5,
    borderBottomColor: print.hairline,
  },
  cDesc: { flex: 1, paddingRight: 12 },
  cQty: { width: 62, textAlign: 'right' },
  cRate: { width: 74, textAlign: 'right' },
  cAmt: { width: 86, textAlign: 'right' },
  cDate: { width: 136, textAlign: 'right' },
  end: {
    flexDirection: 'row',
    gap: 36,
    marginTop: 18,
    alignItems: 'flex-start',
    lineHeight: `${LINE}pt`,
  },
  totals: { width: 230, marginLeft: 'auto' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 9,
    borderTopWidth: 0.5,
    borderTopColor: print.ink,
    fontSize: 11,
    fontWeight: 600,
  },
  terms: { color: print.faint, marginTop: 6, fontSize: 8.5 },
  payBox: { flex: 1 },
  pay: {},
  payTitle: { fontWeight: 600 },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  payCell: { width: '50%', paddingRight: 16, marginBottom: 5 },
  payLabel: { ...label, fontSize: 7 },
  payValue: { fontSize: 9.5 },
  paySub: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: print.hairline,
  },
  payLink: { marginTop: 8, color: accent, fontWeight: 600 },
  payNotes: { marginTop: 8, fontSize: 8.5, color: print.muted },
  notes: {
    marginTop: 26,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: print.hairline,
    color: print.muted,
    lineHeight: `${LINE}pt`,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: M.x,
    right: M.x,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: print.faint,
  },
  voidMark: {
    position: 'absolute',
    top: 300,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 76,
    fontWeight: 600,
    color: print.void,
    opacity: 0.12,
    letterSpacing: 10,
  },

  run: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  runTitle: { fontSize: 24, fontWeight: 300, lineHeight: 1.15 },
  runMeta: { color: print.muted, fontSize: 8.5 },
  runRule: { height: 1, backgroundColor: print.rule, marginBottom: 22 },
  table: { marginBottom: GAP, lineHeight: `${LINE}pt` },
  tTitle: { ...label, marginBottom: 6, textTransform: 'uppercase' },
  continued: { color: print.muted, letterSpacing: 0 },
  tHead: {
    flexDirection: 'row',
    paddingBottom: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: print.rule,
  },
  tHeadCell: label,
  tRow: {
    flexDirection: 'row',
    paddingVertical: ROW.padY,
    borderBottomWidth: ROW.rule,
    borderBottomColor: print.hairline,
  },
  tSum: {
    flexDirection: 'row',
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: print.ink,
    fontWeight: 600,
  },
  tText: { flex: 1, paddingRight: 12, maxLines: 1, textOverflow: 'ellipsis' },
  tDay: { width: 44 },
  tWhen: { width: 96 },
  tHours: { width: 62, textAlign: 'right' },
});

function Rule() {
  return (
    <View style={s.rule}>
      <View style={s.ruleAccent} />
    </View>
  );
}

function LineRows({
  items,
  currency,
}: {
  items: LineItem[];
  currency: string;
}) {
  return items.map((li, i) => (
    <View key={i} style={s.row} wrap={false}>
      <Text style={s.cDesc}>{li.description}</Text>
      {li.unit === 'expense' ? (
        <Text style={s.cDate}>{date(li.spentOn ?? null)}</Text>
      ) : (
        <>
          <Text style={s.cQty}>
            {formatQuantity(li.unit, li.quantity ?? 0)}
          </Text>
          <Text style={s.cRate}>{money(li.unitPrice, currency)}</Text>
        </>
      )}
      <Text style={s.cAmt}>{money(li.amount, currency)}</Text>
    </View>
  ));
}

function Top({ data }: { data: Data }) {
  const { business } = data;
  return (
    <View style={s.top}>
      <View>
        <Text style={s.word}>Invoice</Text>
        <Text style={s.number}>{data.invoiceNumber}</Text>
      </View>
      <View style={s.from}>
        {business.logoUrl ? (
          <Image src={business.logoUrl} style={s.logo} />
        ) : null}
        <Text style={s.biz}>{business.name ?? ''}</Text>
        <Lines text={business.address} style={[s.muted, s.right]} />
        {business.email ? (
          <Text style={[s.muted, s.right]}>{business.email}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Info({ data }: { data: Data }) {
  return (
    <View style={s.info}>
      <View style={s.billTo}>
        <Text style={s.label}>BILLED TO</Text>
        <Text style={s.strong}>{data.client.name}</Text>
        <Lines text={data.client.address} style={s.muted} />
        {data.client.email ? (
          <Text style={s.muted}>{data.client.email}</Text>
        ) : null}
      </View>
      <View style={s.cell}>
        <Text style={s.label}>ISSUED</Text>
        <Text>{date(data.issueDate)}</Text>
      </View>
      <View style={s.cell}>
        <Text style={s.label}>DUE</Text>
        <Text>{date(data.dueDate)}</Text>
      </View>
      <View style={s.due}>
        <Text style={s.label}>AMOUNT DUE</Text>
        <Text style={s.amount}>{money(data.total, data.currency)}</Text>
      </View>
    </View>
  );
}

/** Period and reference, a row of their own; absent when both are. */
function Engagement({ data }: { data: Data }) {
  const when = period(data);
  if (!when && !data.reference) return null;
  return (
    <View style={s.info2}>
      {when ? (
        <View style={[s.info2Cell, { flex: 1.6 }]}>
          <Text style={s.label}>PERIOD</Text>
          <Text>{when}</Text>
        </View>
      ) : null}
      {data.reference ? (
        <View style={[s.info2Cell, { flex: 2.3 }]}>
          <Text style={s.label}>REFERENCE</Text>
          <Text style={{ flex: 1 }}>{data.reference}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LineTable({ data }: { data: Data }) {
  const { services, expenses } = split(data);
  const cur = data.currency;
  return (
    <View style={s.lines}>
      {services.length > 0 || expenses.length === 0 ? (
        <>
          <View style={s.head} wrap={false}>
            <Text style={[s.cDesc, s.label]}>DESCRIPTION</Text>
            <Text style={[s.cQty, s.label]}>QTY</Text>
            <Text style={[s.cRate, s.label]}>RATE</Text>
            <Text style={[s.cAmt, s.label]}>AMOUNT</Text>
          </View>
          <LineRows items={services} currency={cur} />
        </>
      ) : null}
      {expenses.length > 0 ? (
        <>
          <View
            style={[s.head, services.length > 0 ? s.headGap : {}]}
            wrap={false}
          >
            <Text style={[s.cDesc, s.label]}>EXPENSES</Text>
            <Text style={[s.cDate, s.label]}>DATE</Text>
            <Text style={[s.cAmt, s.label]}>AMOUNT</Text>
          </View>
          <LineRows items={expenses} currency={cur} />
        </>
      ) : null}
    </View>
  );
}

function First({ data }: { data: Data }) {
  return (
    <>
      <Top data={data} />
      <Rule />
      <Info data={data} />
      <Engagement data={data} />
      <LineTable data={data} />
      {/* Payment beside the totals, so the page's right side is never
          left empty. */}
      <View style={s.end} wrap={false}>
        {data.payment ? (
          <View style={s.payBox}>
            <PaymentView payment={data.payment} s={payStyles(s)} />
          </View>
        ) : null}
        <TotalsView data={data} s={totals} />
      </View>
      {data.notes ? (
        <View style={s.notes}>
          <Lines text={data.notes} />
        </View>
      ) : null}
    </>
  );
}

function Detail({ data, blocks }: { data: Data; blocks: DetailBlock[] }) {
  return (
    <DetailView
      data={data}
      blocks={blocks}
      s={s}
      below={
        <View style={s.runRule}>
          <View style={s.ruleAccent} />
        </View>
      }
    />
  );
}

const totals: TotalsStyles = {
  box: s.totals,
  row: s.totalRow,
  label: s.muted,
  value: {},
  grand: s.grand,
  grandLabel: {},
  grandValue: { color: accent },
  terms: s.terms,
};

export const modern: Template = {
  page: s.page,
  voidMark: s.voidMark,
  footer: s.footer,
  rowsPerPage: rowsPerPage({
    top: M.top,
    bottom: M.bottom,
    header: RUN,
    tableGap: GAP,
    row: 2 * ROW.padY + LINE + ROW.rule,
  }),
  First,
  Detail,
};
