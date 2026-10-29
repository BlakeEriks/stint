import {
  Circle,
  Image,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import {
  formatCurrency,
  formatQuantity,
  linesByUnit,
  type DetailBlock,
} from '@stint/core';
import { print } from '@stint/design-tokens';
import {
  date,
  Lines,
  PaymentView,
  period,
  DetailView,
  payStyles,
  TotalsView,
  type Data,
  type LineItem,
  type Template,
  type TotalsStyles,
} from './shared';

/*
 * Creative (specs/011-invoice-templates/design/invoice.html): Space Grotesk
 * with IBM Plex Mono figures, a composition of shapes off the top corner, the
 * number up the spine, the amount due in a ring, and the lines grouped by
 * kind, each kind marked by one of the shapes in the accent.
 */

const LINE = 14;
const M = { top: 48, right: 52, bottom: 52, left: 76 };
const ROW = { padY: 3.5, rule: 0.5 };
/** A detail page's running header: its title, the space over its rule, the
 *  rule and the space under it. */
const RUN = { title: 26, pad: 8, rule: 2, after: 18 };
const GAP = 18;
const FIGURES = 'IBM Plex Mono';

const label = {
  fontSize: 7.5,
  letterSpacing: 1.4,
  fontWeight: 700,
  color: print.faint,
} as const;

const s = StyleSheet.create({
  page: {
    fontFamily: 'Space Grotesk',
    fontSize: 9.5,
    color: print.ink,
  },
  label,
  fig: { fontFamily: FIGURES },
  muted: { color: print.muted },
  strong: { fontWeight: 700 },
  spine: {
    position: 'absolute',
    top: 48,
    left: 34,
    transform: 'rotate(90deg)',
    transformOrigin: 'left top',
    fontSize: 8,
    letterSpacing: 4,
    fontWeight: 700,
    color: print.faint,
    width: 300,
  },
  shapes: { position: 'absolute', top: -62, right: -40 },
  letterhead: { maxWidth: 300, lineHeight: `${LINE}pt` },
  logo: { width: 108, height: 36, objectFit: 'contain', marginBottom: 8 },
  biz: { fontSize: 26, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1 },
  sub: { color: print.muted, marginTop: 6 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    marginTop: 20,
    marginBottom: 12,
    lineHeight: `${LINE}pt`,
  },
  ring: {
    width: 134,
    height: 134,
    borderRadius: 67,
    borderWidth: 2,
    borderColor: print.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 14,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: print.accent,
  },
  amount: {
    fontFamily: FIGURES,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: -0.5,
    lineHeight: 1.3,
  },
  tiles: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 2,
    borderTopColor: print.ink,
  },
  tile: {
    width: '50%',
    paddingVertical: 7,
    paddingRight: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: print.rule,
  },
  wide: { width: '100%' },
  lines: { lineHeight: `${LINE}pt` },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
    marginBottom: 1,
  },
  kindSum: { marginLeft: 'auto', color: print.muted, fontFamily: FIGURES },
  item: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: print.hairline,
  },
  n: {
    width: 30,
    fontFamily: FIGURES,
    fontSize: 13,
    fontWeight: 600,
    color: print.faint,
  },
  desc: { flex: 1 },
  itemAmount: {
    width: 100,
    textAlign: 'right',
    fontFamily: FIGURES,
    fontWeight: 600,
  },
  end: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 12,
    alignItems: 'flex-start',
  },
  payBox: { flex: 1 },
  totals: {
    width: 180,
    marginLeft: 'auto',
    lineHeight: `${LINE}pt`,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: print.ink,
    fontWeight: 700,
    fontSize: 11,
  },
  terms: { color: print.faint, marginTop: 6, fontSize: 8.5 },
  pay: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: print.ink,
    borderRadius: 10,
    lineHeight: `${LINE}pt`,
  },
  payTitle: { fontWeight: 700 },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  payCell: { width: '50%', paddingRight: 10, marginBottom: 5 },
  payLabel: { ...label, fontSize: 7 },
  payValue: { fontFamily: FIGURES, fontSize: 9 },
  paySub: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: print.rule,
  },
  payLink: { marginTop: 8, fontWeight: 700, color: print.accent },
  payNotes: { marginTop: 8, fontSize: 8.5, color: print.muted },
  notes: { marginTop: 12, color: print.muted, lineHeight: `${LINE}pt` },
  footer: { fontSize: 8, color: print.faint },
  voidMark: { fontWeight: 700, color: print.void },

  run: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: RUN.pad,
    marginBottom: RUN.after,
    borderBottomWidth: RUN.rule,
    borderBottomColor: print.ink,
  },
  runTitle: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.6,
    lineHeight: `${RUN.title}pt`,
  },
  runMeta: { color: print.muted, fontSize: 8.5 },
  table: { marginBottom: GAP, lineHeight: `${LINE}pt` },
  tTitle: { ...label, marginLeft: 8, textTransform: 'uppercase' },
  continued: { color: print.muted, letterSpacing: 0, fontWeight: 400 },
  tHead: {
    flexDirection: 'row',
    marginTop: 4,
    paddingBottom: 4,
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
    paddingTop: 5,
    borderTopWidth: 2,
    borderTopColor: print.ink,
    fontWeight: 700,
  },
  tText: { flex: 1, paddingRight: 12, maxLines: 1, textOverflow: 'ellipsis' },
  tDay: { width: 44 },
  tWhen: { width: 96 },
  tHours: { width: 62, textAlign: 'right', fontFamily: FIGURES },
});

/** The page's three shapes, each marking one kind of line or table. */
const MARK = {
  circle: (
    <Svg width={10} height={10} viewBox="0 0 10 10">
      <Circle cx={5} cy={5} r={5} fill={print.accent} />
    </Svg>
  ),
  square: (
    <Svg width={10} height={10} viewBox="0 0 10 10">
      <Rect
        x={0.5}
        y={0.5}
        width={9}
        height={9}
        fill={print.accent}
        transform="rotate(12 5 5)"
      />
    </Svg>
  ),
  triangle: (
    <Svg width={11} height={10} viewBox="0 0 11 10">
      <Path d="M5.5 0 L11 10 L0 10 Z" fill={print.accent} />
    </Svg>
  ),
};

function Spine({ data }: { data: Data }) {
  return (
    <Text style={s.spine} fixed>
      INVOICE — {data.invoiceNumber}
    </Text>
  );
}

function Shapes() {
  return (
    <Svg style={s.shapes} width={230} height={204} viewBox="0 0 260 230">
      <Circle
        cx={170}
        cy={90}
        r={88}
        fill="none"
        stroke={print.ink}
        strokeWidth={1.5}
      />
      <Rect
        x={86}
        y={118}
        width={70}
        height={70}
        fill={print.ink}
        transform="rotate(12 121 153)"
      />
      <Circle cx={210} cy={176} r={22} fill={print.accent} />
      <Path
        d="M40 200 L74 140 L108 200 Z"
        fill="none"
        stroke={print.ink}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

const KIND = {
  hour: { title: 'TIME', mark: MARK.circle },
  fixed: { title: 'FIXED FEES', mark: MARK.square },
  expense: { title: 'EXPENSES', mark: MARK.triangle },
};

/** Time, fixed fees and expenses, each with its total, numbered straight
 *  through. */
function kinds(data: Data) {
  const cur = data.currency;
  const aside = (li: LineItem) =>
    li.unit === 'expense'
      ? date(li.spentOn ?? null)
      : li.unit === 'fixed' && (li.quantity ?? 1) === 1
        ? 'Fixed'
        : `${formatQuantity(li.unit, li.quantity ?? 0)} × ${formatCurrency(li.unitPrice, cur)}`;
  let n = 0;
  return linesByUnit(data.lineItems).map((k) => ({
    ...KIND[k.unit],
    sum: formatCurrency(k.total, cur),
    rows: k.items.map((li) => ({ li, aside: aside(li), n: ++n })),
  }));
}

function First({ data }: { data: Data }) {
  const { business } = data;
  const cur = data.currency;
  const when = period(data);
  const contact = [business.address?.split('\n').join(', '), business.email]
    .filter(Boolean)
    .join('\n');
  return (
    <>
      <Spine data={data} />
      <Shapes />
      <View style={s.letterhead}>
        {business.logoUrl ? (
          <Image src={business.logoUrl} style={s.logo} />
        ) : null}
        <Text style={s.biz}>{business.name ?? ''}</Text>
        <View style={s.sub}>
          <Lines text={contact || null} />
        </View>
      </View>

      <View style={s.hero} wrap={false}>
        <View style={s.ring}>
          <View style={s.dot} />
          <Text style={s.label}>AMOUNT DUE</Text>
          <Text style={s.amount}>{formatCurrency(data.total, cur)}</Text>
          {data.dueDate ? (
            <Text style={s.muted}>by {date(data.dueDate)}</Text>
          ) : null}
        </View>
        <View style={s.tiles}>
          <View style={s.tile}>
            <Text style={s.label}>BILLED TO</Text>
            <Text style={s.strong}>{data.client.name}</Text>
            {data.client.address ? (
              <Text style={s.muted}>
                {data.client.address.split('\n').join(', ')}
              </Text>
            ) : null}
          </View>
          <View style={s.tile}>
            <Text style={s.label}>ISSUED</Text>
            <Text>{date(data.issueDate)}</Text>
          </View>
          {when ? (
            <View style={s.tile}>
              <Text style={s.label}>PERIOD</Text>
              <Text>{when}</Text>
            </View>
          ) : null}
          <View style={s.tile}>
            <Text style={s.label}>DUE</Text>
            <Text style={s.strong}>{date(data.dueDate)}</Text>
          </View>
          {data.reference ? (
            <View style={[s.tile, s.wide]}>
              <Text style={s.label}>REFERENCE</Text>
              <Text>{data.reference}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={s.lines}>
        {kinds(data).map((k) => (
          <View key={k.title}>
            <View style={s.kind} wrap={false}>
              {k.mark}
              <Text style={s.label}>{k.title}</Text>
              <Text style={s.kindSum}>{k.sum}</Text>
            </View>
            {k.rows.map(({ li, aside, n }) => (
              <View key={n} style={s.item} wrap={false}>
                <Text style={s.n}>{String(n).padStart(2, '0')}</Text>
                <Text style={s.desc}>
                  <Text style={s.strong}>{li.description}</Text>
                  <Text style={s.muted}> {aside}</Text>
                </Text>
                <Text style={s.itemAmount}>
                  {formatCurrency(li.amount, cur)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* The stub beside the totals, as Modern sets it, so an invoice of a
          few lines keeps its payment details on page 1. */}
      <View style={s.end} wrap={false}>
        {data.payment ? (
          <View style={s.payBox}>
            <PaymentView payment={data.payment} s={payStyles(s)} />
          </View>
        ) : null}
        <TotalsView data={data} s={totals} label="Total" />
      </View>
      {data.notes ? (
        <View style={s.notes}>
          <Lines text={data.notes} />
        </View>
      ) : null}
    </>
  );
}

const TABLE_MARK = {
  project: MARK.circle,
  week: MARK.square,
  date: MARK.triangle,
};

function Detail({ data, blocks }: { data: Data; blocks: DetailBlock[] }) {
  return (
    <DetailView
      data={data}
      blocks={blocks}
      s={s}
      above={<Spine data={data} />}
      mark={(kind) => TABLE_MARK[kind]}
    />
  );
}

const totals: TotalsStyles = {
  box: s.totals,
  row: s.totalRow,
  label: s.muted,
  value: s.fig,
  grand: s.grand,
  grandLabel: {},
  grandValue: s.fig,
  terms: s.terms,
};

export const creative: Template = {
  page: s.page,
  voidMark: s.voidMark,
  footer: s.footer,
  margin: M,
  detail: {
    header: RUN.title + RUN.pad + RUN.rule + RUN.after,
    tableGap: GAP,
    row: 2 * ROW.padY + LINE + ROW.rule,
  },
  First,
  Detail,
};
