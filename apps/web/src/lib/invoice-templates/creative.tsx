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
  runMeta,
  ScheduleView,
  totalRows,
  type Data,
  type LineItem,
  type Template,
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
const RUN = 26 + 8 + 2 + 18;
const GAP = 18;
const FIGURES = 'IBM Plex Mono';

const label = {
  fontSize: 7.5,
  letterSpacing: 1.4,
  fontWeight: 700,
  color: print.faint,
} as const;

const s = StyleSheet.create({
  // Line height is set on each section, never on the page: see standard.tsx.
  page: {
    paddingTop: M.top,
    paddingRight: M.right,
    paddingBottom: M.bottom,
    paddingLeft: M.left,
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
    backgroundColor: accent,
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
  totals: {
    width: 230,
    marginLeft: 'auto',
    marginTop: 12,
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
    marginTop: 16,
    paddingVertical: 12,
    paddingRight: 18,
    paddingLeft: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: print.ink,
    borderRadius: 10,
    lineHeight: `${LINE}pt`,
  },
  payTitle: { fontWeight: 700 },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  payCell: { width: '33.33%', paddingRight: 10, marginBottom: 5 },
  payLabel: { ...label, fontSize: 7 },
  payValue: { fontFamily: FIGURES, fontSize: 9 },
  paySub: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: print.rule,
  },
  payLink: { marginTop: 8, fontWeight: 700, color: accent },
  payNotes: { marginTop: 8, fontSize: 8.5, color: print.muted },
  notes: { marginTop: 12, color: print.muted, lineHeight: `${LINE}pt` },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: M.left,
    right: M.right,
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
    fontWeight: 700,
    color: print.void,
    opacity: 0.12,
    letterSpacing: 10,
  },

  run: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    marginBottom: 18,
    borderBottomWidth: 2,
    borderBottomColor: print.ink,
  },
  runTitle: { fontSize: 22, fontWeight: 700, letterSpacing: -0.6 },
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
      <Circle cx={5} cy={5} r={5} fill={accent} />
    </Svg>
  ),
  square: (
    <Svg width={10} height={10} viewBox="0 0 10 10">
      <Rect
        x={0.5}
        y={0.5}
        width={9}
        height={9}
        fill={accent}
        transform="rotate(12 5 5)"
      />
    </Svg>
  ),
  triangle: (
    <Svg width={11} height={10} viewBox="0 0 11 10">
      <Path d="M5.5 0 L11 10 L0 10 Z" fill={accent} />
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
      <Circle cx={210} cy={176} r={22} fill={accent} />
      <Path
        d="M40 200 L74 140 L108 200 Z"
        fill="none"
        stroke={print.ink}
        strokeWidth={1.5}
      />
    </Svg>
  );
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Time, fixed fees and expenses, in that order; a kind with none is left out. */
function kinds(data: Data) {
  const cur = data.currency;
  // Numbered straight through, across the kinds.
  let n = 0;
  const of = (unit: LineItem['unit']) =>
    data.lineItems.filter((li) => li.unit === unit);
  const aside = (li: LineItem) =>
    li.unit === 'expense'
      ? date(li.spentOn ?? null)
      : li.unit === 'fixed'
        ? (li.quantity ?? 1) === 1
          ? 'Fixed'
          : `${formatQuantity('fixed', li.quantity ?? 0)} × ${money(li.unitPrice, cur)}`
        : `${formatQuantity('hour', li.quantity ?? 0)} × ${money(li.unitPrice, cur)}`;
  return [
    { title: 'TIME', mark: MARK.circle, items: of('hour') },
    { title: 'FIXED FEES', mark: MARK.square, items: of('fixed') },
    { title: 'EXPENSES', mark: MARK.triangle, items: of('expense') },
  ]
    .filter((k) => k.items.length > 0)
    .map((k) => ({
      ...k,
      sum: money(
        cents(k.items.reduce((t, li) => t + (li.amount ?? 0), 0)),
        cur,
      ),
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
          <Text style={s.amount}>{money(data.total, cur)}</Text>
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
                <Text style={s.itemAmount}>{money(li.amount, cur)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={s.totals} wrap={false}>
        {totalRows(data).map((r) => (
          <View key={r.label} style={s.totalRow}>
            <Text style={s.muted}>{r.label}</Text>
            <Text style={s.fig}>{r.value}</Text>
          </View>
        ))}
        <View style={s.grand}>
          <Text>Total</Text>
          <Text style={s.fig}>{money(data.total, cur)}</Text>
        </View>
        {data.paymentTerms ? (
          <Text style={s.terms}>{data.paymentTerms}</Text>
        ) : null}
      </View>

      {data.payment ? (
        <PaymentView
          payment={data.payment}
          s={{
            box: s.pay,
            title: s.payTitle,
            grid: s.payGrid,
            cell: s.payCell,
            label: s.payLabel,
            value: s.payValue,
            sub: s.paySub,
            link: s.payLink,
            notes: s.payNotes,
          }}
        />
      ) : null}
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
    <>
      <Spine data={data} />
      <View style={s.run}>
        <Text style={s.runTitle}>Supporting detail</Text>
        <Text style={s.runMeta}>{runMeta(data)}</Text>
      </View>
      {blocks.map((block, i) => (
        <ScheduleView
          key={i}
          block={block}
          mark={TABLE_MARK[block.kind]}
          s={{
            table: s.table,
            title: s.tTitle,
            continued: s.continued,
            head: s.tHead,
            headCell: s.tHeadCell,
            row: s.tRow,
            sum: s.tSum,
            text: s.tText,
            day: s.tDay,
            when: s.tWhen,
            hours: s.tHours,
          }}
        />
      ))}
    </>
  );
}

export const creative: Template = {
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
