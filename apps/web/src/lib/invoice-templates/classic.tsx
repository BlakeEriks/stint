import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatCurrency, formatQuantity, type DetailBlock } from '@stint/core';
import { print } from '@stint/design-tokens';
import {
  date,
  Lines,
  PaymentView,
  period,
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
 * Classic (specs/011-invoice-templates/design/invoice.html): EB Garamond, an
 * italic "Invoice" over its number, a thin accent rule, the business centered
 * beneath, and lines set like a table of contents. The accent marks the rule,
 * the section labels and the balance due.
 *
 * The renderer has no small capitals, so they are set as capitals at a
 * smaller size, tracked out.
 */

const LINE = 15;
const M = { top: 44, right: 52, bottom: 52, left: 52 };
const ROW = { padY: 3, rule: 0.5 };
/** A detail page's running header: a line, the space over its rule, the
 *  rule and the space under it. */
const RUN = { pad: 8, rule: 0.5, after: 18 };
const GAP = 18;

const caps = {
  textTransform: 'uppercase',
  fontSize: 8,
  letterSpacing: 1.4,
  color: print.muted,
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: 'EB Garamond',
    fontSize: 10.5,
    color: print.ink,
  },
  head: { alignItems: 'center', lineHeight: `${LINE}pt` },
  title: { fontSize: 26, fontStyle: 'italic', lineHeight: 1.15 },
  number: { ...caps },
  rule: {
    width: 160,
    height: 1.25,
    backgroundColor: print.accent,
    marginVertical: 14,
  },
  logo: { width: 108, height: 36, objectFit: 'contain', marginBottom: 8 },
  biz: { fontSize: 13, letterSpacing: 2.4, textTransform: 'uppercase' },
  addr: { color: print.muted, marginTop: 2, textAlign: 'center' },
  caps,
  muted: { color: print.muted },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 24,
    marginTop: 20,
    marginBottom: 18,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: print.rule,
    lineHeight: `${LINE}pt`,
  },
  billTo: { maxWidth: '45%' },
  // Labels in one column and values in another, both flush left.
  kv: { maxWidth: '55%' },
  kvRow: { flexDirection: 'row', gap: 12, alignItems: 'baseline' },
  kvLabel: { ...caps, width: 60 },
  kvValue: { flexShrink: 1 },
  part: { ...caps, color: print.accent, marginTop: 10, marginBottom: 2 },
  lines: { lineHeight: `${LINE}pt` },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 3.5 },
  desc: { flexShrink: 1 },
  aside: { color: print.muted, marginLeft: 6, flexShrink: 0 },
  leader: {
    flexGrow: 1,
    minWidth: 12,
    marginHorizontal: 6,
    marginBottom: 4,
    borderBottomWidth: 0.75,
    borderBottomStyle: 'dotted',
    borderBottomColor: print.rule,
  },
  amount: { flexShrink: 0 },
  totals: {
    width: 240,
    marginLeft: 'auto',
    marginTop: 12,
    lineHeight: `${LINE}pt`,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: print.ink,
  },
  grandLabel: {
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 1.4,
  },
  grandValue: { fontSize: 13, color: print.accent },
  terms: { color: print.muted, marginTop: 4, fontSize: 9.5 },
  pay: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: print.rule,
    lineHeight: `${LINE}pt`,
  },
  payTitle: {
    textTransform: 'uppercase',
    fontSize: 9.5,
    letterSpacing: 1.4,
  },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  payCell: { width: '33.33%', paddingRight: 18, marginBottom: 4 },
  payLabel: { ...caps, fontSize: 7 },
  payValue: {},
  paySub: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: print.hairline,
  },
  payLink: { marginTop: 8, color: print.accent },
  payNotes: { marginTop: 8, color: print.muted },
  notes: { marginTop: 14, lineHeight: `${LINE}pt` },
  footer: { fontSize: 9, color: print.muted },
  voidMark: { color: print.void },

  run: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: RUN.pad,
    marginBottom: RUN.after,
    borderBottomWidth: RUN.rule,
    borderBottomColor: print.ink,
    lineHeight: `${LINE}pt`,
  },
  runTitle: { textTransform: 'uppercase', fontSize: 10, letterSpacing: 1.6 },
  runMeta: { color: print.muted, fontSize: 9 },
  table: { marginBottom: GAP, lineHeight: `${LINE}pt` },
  tTitle: { ...caps, fontSize: 9, color: print.accent, marginBottom: 4 },
  continued: { textTransform: 'none', letterSpacing: 0, color: print.muted },
  tHead: {
    flexDirection: 'row',
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: print.ink,
  },
  tHeadCell: { ...caps, fontSize: 7 },
  tRow: {
    flexDirection: 'row',
    paddingVertical: ROW.padY,
    borderBottomWidth: ROW.rule,
    borderBottomColor: print.rule,
  },
  tSum: {
    flexDirection: 'row',
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: print.ink,
  },
  tText: { flex: 1, paddingRight: 12, maxLines: 1, textOverflow: 'ellipsis' },
  tDay: { width: 44 },
  tWhen: { width: 96 },
  tHours: { width: 62, textAlign: 'right' },
});

/** Quantity and rate as a phrase, the date for an expense. */
function aside(li: LineItem, currency: string) {
  if (li.unit === 'expense') return date(li.spentOn ?? null);
  if (li.unit === 'fixed')
    return (li.quantity ?? 1) === 1
      ? 'fixed fee'
      : `${formatQuantity('fixed', li.quantity ?? 0)} at ${formatCurrency(li.unitPrice, currency)}`;
  return `${formatQuantity('hour', li.quantity ?? 0)} at ${formatCurrency(li.unitPrice, currency)}`;
}

function Leaders({ items, currency }: { items: LineItem[]; currency: string }) {
  return items.map((li, i) => (
    <View key={i} style={s.row} wrap={false}>
      <Text style={s.desc}>{li.description}</Text>
      <Text style={s.aside}>{aside(li, currency)}</Text>
      <View style={s.leader} />
      <Text style={s.amount}>{formatCurrency(li.amount, currency)}</Text>
    </View>
  ));
}

function First({ data }: { data: Data }) {
  const { business } = data;
  const { services, expenses } = split(data);
  const cur = data.currency;
  const when = period(data);
  const contact = [
    ...(business.address?.split('\n') ?? []),
    business.email,
  ].filter(Boolean);
  const kv: [string, string][] = [
    ['Issued', date(data.issueDate)],
    ['Due', date(data.dueDate)],
    ...(when ? [['Period', when] as [string, string]] : []),
    ...(data.reference
      ? [['Reference', data.reference] as [string, string]]
      : []),
  ];
  return (
    <>
      <View style={s.head}>
        <Text style={s.title}>Invoice</Text>
        <Text style={s.number}>No. {data.invoiceNumber}</Text>
        <View style={s.rule} />
        {business.logoUrl ? (
          <Image src={business.logoUrl} style={s.logo} />
        ) : null}
        <Text style={s.biz}>{business.name ?? ''}</Text>
        {contact.length > 0 ? (
          <Text style={s.addr}>{contact.join(' · ')}</Text>
        ) : null}
      </View>

      <View style={s.meta}>
        <View style={s.billTo}>
          <Text style={s.caps}>Billed to</Text>
          <Text>{data.client.name}</Text>
          <Lines text={data.client.address} style={s.muted} />
          {data.client.email ? (
            <Text style={s.muted}>{data.client.email}</Text>
          ) : null}
        </View>
        <View style={s.kv}>
          {kv.map(([k, v]) => (
            <View key={k} style={s.kvRow}>
              <Text style={s.kvLabel}>{k}</Text>
              <Text style={s.kvValue}>{v}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.lines}>
        {services.length > 0 ? (
          <>
            <Text style={s.part}>Services</Text>
            <Leaders items={services} currency={cur} />
          </>
        ) : null}
        {expenses.length > 0 ? (
          <>
            <Text style={s.part}>Expenses</Text>
            <Leaders items={expenses} currency={cur} />
          </>
        ) : null}
      </View>

      <TotalsView data={data} s={totals} label="Balance due" wrap={false} />

      {data.payment ? (
        <PaymentView payment={data.payment} s={payStyles(s)} />
      ) : null}
      {data.notes ? (
        <View style={s.notes}>
          <Lines text={data.notes} />
        </View>
      ) : null}
    </>
  );
}

function Detail({ data, blocks }: { data: Data; blocks: DetailBlock[] }) {
  return <DetailView data={data} blocks={blocks} s={s} />;
}

const totals: TotalsStyles = {
  box: s.totals,
  row: s.totalRow,
  label: s.muted,
  value: {},
  grand: s.grand,
  grandLabel: s.grandLabel,
  grandValue: s.grandValue,
  terms: s.terms,
};

export const classic: Template = {
  page: s.page,
  voidMark: s.voidMark,
  footer: s.footer,
  margin: M,
  detail: {
    header: LINE + RUN.pad + RUN.rule + RUN.after,
    tableGap: GAP,
    row: 2 * ROW.padY + LINE + ROW.rule,
  },
  First,
  Detail,
};
