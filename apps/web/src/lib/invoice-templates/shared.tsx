import type { ReactNode } from 'react';
import { type StyleSheet, Text, View } from '@react-pdf/renderer';
import {
  formatCurrency,
  formatHours,
  SCHEDULE_KINDS,
  SCHEDULE_TITLES,
  type DateRow,
  type DetailBlock,
  type ProjectRow,
  type Schedules,
  type WeekRow,
} from '@stint/core';
import type { InvoiceTemplate } from '@stint/schema';
import { print } from '@stint/design-tokens';

export type Style = Parameters<typeof StyleSheet.create>[0][string];

/** The brand mark on paper: each template spends it in the few places its
 *  design names. */
export const accent = print.accent;

interface InvoicePdfData {
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
  /** The frozen supporting detail, printed from page 2; null when none. */
  supportingDetail?: Schedules | null;
  template: InvoiceTemplate;
}

export type Data = InvoicePdfData;
export type LineItem = Data['lineItems'][number];
export type Payment = NonNullable<Data['payment']>;

/**
 * One template: its page, its first page's content and its detail pages'.
 * The document shell around it draws what every template shares — the VOID
 * mark, the footer and where the detail pages break — so none can drop one.
 */
export interface Template {
  /** Margins, font and color for every page. */
  page: Style;
  /** The VOID mark's face; the shell places it. */
  voidMark: Style;
  footer: Style;
  /** One-line rows a detail page holds; `paginateSchedules` breaks on it. */
  rowsPerPage: number;
  First: (p: { data: Data }) => ReactNode;
  Detail: (p: { data: Data; blocks: DetailBlock[] }) => ReactNode;
}

/** US Letter, in points. */
export const PAGE_SIZE = { width: 612, height: 792 };

/**
 * Rows that fit a detail page. `paginateSchedules` charges a table's headings
 * and total one row each, but not the gap under it, so the gap is reserved
 * for every table a page can hold.
 */
export function rowsPerPage(g: {
  top: number;
  bottom: number;
  /** The running header, with the space under it. */
  header: number;
  tableGap: number;
  row: number;
}) {
  return Math.floor(
    (PAGE_SIZE.height -
      g.top -
      g.bottom -
      g.header -
      SCHEDULE_KINDS.length * g.tableGap) /
      g.row,
  );
}

const DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
});

export const date = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

export const period = (data: Data) =>
  data.periodStart && data.periodEnd
    ? `${date(data.periodStart)} – ${date(data.periodEnd)}`
    : null;

export const money = (n: number | null, currency: string) =>
  formatCurrency(n, currency);

/** Multi-line text without relying on newlines surviving layout. */
export function Lines({
  text,
  style,
}: {
  text: string | null;
  style?: Style | Style[];
}) {
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

/** Services (time and fixed fees) and reimbursed expenses, apart. */
export function split(data: Data) {
  return {
    services: data.lineItems.filter((li) => li.unit !== 'expense'),
    expenses: data.lineItems.filter((li) => li.unit === 'expense'),
  };
}

/**
 * The rows above the total. An invoice of expenses alone has no services to
 * subtotal; tax shows only when charged.
 */
function totalRows(data: Data) {
  const { services, expenses } = split(data);
  const cur = data.currency;
  const rows: { label: string; value: string }[] = [];
  if (services.length > 0 || expenses.length === 0)
    rows.push({
      label: expenses.length > 0 ? 'Services' : 'Subtotal',
      value: money(data.subtotal, cur),
    });
  if (data.taxRate > 0)
    rows.push({
      label: `Tax (${data.taxRate}%)`,
      value: money(data.taxAmount, cur),
    });
  if (expenses.length > 0)
    rows.push({ label: 'Expenses', value: money(data.expensesSubtotal, cur) });
  return rows;
}

/** The slots a template styles in the totals. */
export interface TotalsStyles {
  box: Style;
  row: Style;
  label: Style;
  value: Style;
  grand: Style;
  grandLabel: Style;
  grandValue: Style;
  terms: Style;
}

export function TotalsView({
  data,
  s,
  label = 'Amount due',
  wrap = true,
}: {
  data: Data;
  s: TotalsStyles;
  label?: string;
  wrap?: boolean;
}) {
  return (
    <View style={s.box} wrap={wrap}>
      {totalRows(data).map((r) => (
        <View key={r.label} style={s.row}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.value}>{r.value}</Text>
        </View>
      ))}
      <View style={s.grand}>
        <Text style={s.grandLabel}>{label}</Text>
        <Text style={s.grandValue}>{money(data.total, data.currency)}</Text>
      </View>
      {data.paymentTerms ? (
        <Text style={s.terms}>{data.paymentTerms}</Text>
      ) : null}
    </View>
  );
}

const paymentTitle = (payment: Payment) =>
  payment.title ? `Payment — ${payment.title}` : 'Payment details';

/** The slots a template styles in the payment block. */
export interface PaymentStyles {
  box: Style;
  title: Style;
  grid: Style;
  cell: Style;
  label: Style;
  value: Style;
  sub: Style;
  link: Style;
  notes: Style;
}

export function PaymentView({
  payment,
  s,
  title = paymentTitle(payment),
}: {
  payment: Payment;
  s: PaymentStyles;
  title?: string;
}) {
  const grid = (fields: Payment['fields'], style: Style | Style[]) => (
    <View style={style}>
      {fields.map((f, i) => (
        <View key={i} style={s.cell}>
          <Text style={s.label}>{f.label.toUpperCase()}</Text>
          <Text style={s.value}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View style={s.box} wrap={false}>
      <Text style={s.title}>{title}</Text>
      {grid(payment.fields, s.grid)}
      {payment.intermediary.length > 0
        ? grid(payment.intermediary, [s.grid, s.sub])
        : null}
      {payment.link ? (
        <Text style={s.link}>
          {payment.link.label}: {payment.link.url}
        </Text>
      ) : null}
      <Lines text={payment.notes} style={s.notes} />
    </View>
  );
}

/** The slots a template styles in a supporting-detail table. */
export interface ScheduleStyles {
  table: Style;
  title: Style;
  continued: Style;
  head: Style;
  headCell: Style;
  row: Style;
  sum: Style;
  text: Style;
  day: Style;
  when: Style;
  hours: Style;
}

/** Hours only: a schedule shows how the time was spent, never what it cost. */
export function ScheduleView({
  block,
  s,
  mark,
}: {
  block: DetailBlock;
  s: ScheduleStyles;
  /** Drawn before the title; Creative's shape. */
  mark?: ReactNode;
}) {
  const head = (text: string, style: Style) => (
    <Text style={[style, s.headCell]}>{text}</Text>
  );
  return (
    <View style={s.table}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {mark}
        <Text style={s.title}>
          {SCHEDULE_TITLES[block.kind]}
          {block.continued ? (
            <Text style={s.continued}> (continued)</Text>
          ) : null}
        </Text>
      </View>
      <View style={s.head}>
        {block.kind === 'date' ? (
          <>
            {head('DATE', s.when)}
            {head('DAY', s.day)}
          </>
        ) : null}
        {head(block.kind === 'week' ? 'WEEK' : 'PROJECT', s.text)}
        {head('HOURS', s.hours)}
      </View>
      {block.rows.map((row, i) => (
        <View key={i} style={s.row}>
          <ScheduleCells block={block} row={row} s={s} />
          <Text style={s.hours}>{formatHours(row.hours)}</Text>
        </View>
      ))}
      {block.total !== null ? (
        <View style={s.sum}>
          <Text style={s.text}>Total</Text>
          <Text style={s.hours}>{formatHours(block.total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleCells({
  block,
  row,
  s,
}: {
  block: DetailBlock;
  row: DetailBlock['rows'][number];
  s: ScheduleStyles;
}) {
  if (block.kind === 'project')
    return <Text style={s.text}>{(row as ProjectRow).project}</Text>;
  if (block.kind === 'week') {
    const w = row as WeekRow;
    return (
      <Text style={s.text}>
        {date(w.start)} – {date(w.end)}
      </Text>
    );
  }
  const d = row as DateRow;
  return (
    <>
      <Text style={s.when}>{date(d.date)}</Text>
      <Text style={s.day}>{DAY.format(new Date(`${d.date}T00:00:00Z`))}</Text>
      <Text style={s.text}>{d.project}</Text>
    </>
  );
}

/** The running header over every detail page. */
export const runMeta = (data: Data) =>
  `${data.invoiceNumber} · ${data.client.name} · ${date(data.periodStart)} – ${date(data.periodEnd)}`;

/** The style keys Modern, Classic and Creative share, so each passes its
 *  sheet rather than mapping every slot. */
type Sheet = Record<
  | 'pay'
  | 'payTitle'
  | 'payGrid'
  | 'payCell'
  | 'payLabel'
  | 'payValue'
  | 'paySub'
  | 'payLink'
  | 'payNotes'
  | 'table'
  | 'tTitle'
  | 'continued'
  | 'tHead'
  | 'tHeadCell'
  | 'tRow'
  | 'tSum'
  | 'tText'
  | 'tDay'
  | 'tWhen'
  | 'tHours'
  | 'run'
  | 'runTitle'
  | 'runMeta',
  Style
>;

export const payStyles = (s: Sheet): PaymentStyles => ({
  box: s.pay,
  title: s.payTitle,
  grid: s.payGrid,
  cell: s.payCell,
  label: s.payLabel,
  value: s.payValue,
  sub: s.paySub,
  link: s.payLink,
  notes: s.payNotes,
});

/** A detail page: the running header, then each table. */
export function DetailView({
  data,
  blocks,
  s,
  mark,
  above,
  below,
}: {
  data: Data;
  blocks: DetailBlock[];
  s: Sheet;
  /** Drawn before a table's title. */
  mark?: (kind: DetailBlock['kind']) => ReactNode;
  /** Before the running header, and between it and the first table. */
  above?: ReactNode;
  below?: ReactNode;
}) {
  const table: ScheduleStyles = {
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
  };
  return (
    <>
      {above}
      <View style={s.run}>
        <Text style={s.runTitle}>Supporting detail</Text>
        <Text style={s.runMeta}>{runMeta(data)}</Text>
      </View>
      {below}
      {blocks.map((block, i) => (
        <ScheduleView
          key={i}
          block={block}
          s={table}
          mark={mark?.(block.kind)}
        />
      ))}
    </>
  );
}
