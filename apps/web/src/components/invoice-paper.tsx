import type { CSSProperties, ReactNode } from 'react';
import {
  formatCurrency,
  formatHours,
  formatQuantity,
  type PaymentDetails,
  SCHEDULE_KINDS,
  SCHEDULE_TITLES,
  type ScheduleKind,
  type Schedules,
} from '@stint/core';
import type { InvoiceTemplate } from '@stint/schema';
import { shortDate } from './invoice-bits';

/*
 * The invoice drawn on paper, in each template's look: the preview beside New
 * invoice and on an invoice's page, and every template thumbnail. It draws
 * what `lib/invoice-templates/` prints (specs/011-invoice-templates/design/
 * invoice.html), in HTML, because the PDF itself is the paid document and a
 * PDF in the browser can be saved.
 *
 * Geometry is in points of a 612pt Letter page, scaled to the paper's width:
 * `pt(n)` is n points at whatever size the paper is drawn.
 */
const pt = (n: number) => `calc(var(--pt) * ${n})`;

type Line = {
  description: string;
  unit: 'hour' | 'fixed' | 'expense';
  quantity: number;
  unitPrice: number | null;
  amount: number;
  spentOn?: string | null;
  /** A draft's line its last PDF didn't have. */
  isNew?: boolean;
};

export interface PaperInvoice {
  number: string;
  issued: string;
  due: string | null;
  period: { start: string; end: string } | null;
  reference: string | null;
  /** Undefined while it loads. */
  business:
    | { name: string | null; address: string | null; email: string | null }
    | undefined;
  /** No business name or email yet: marks where they will print. */
  noSender?: boolean;
  client: { name: string; address?: string | null; email?: string | null };
  /** Undefined while an issued invoice loads them. */
  lines: Line[] | undefined;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  expensesSubtotal: number;
  total: number;
  currency: string;
  terms: string | null;
  payment: PaymentDetails | null;
  notes: string | null;
}

type Props = { invoice: PaperInvoice };

const FACE: Record<InvoiceTemplate, string> = {
  standard: 'Helvetica, Arial, sans-serif',
  modern: 'var(--font-outfit), sans-serif',
  classic: 'var(--font-garamond), Garamond, serif',
  creative: 'var(--font-grotesk), sans-serif',
};
const FIGURES: Record<InvoiceTemplate, string> = {
  standard: 'Courier, "Courier New", monospace',
  modern: 'inherit',
  classic: 'inherit',
  creative: 'var(--font-plex-mono), monospace',
};

/** One Letter page; `children` is its content. */
function Sheet({
  template,
  pad,
  children,
}: {
  template: InvoiceTemplate;
  /** Top, right, bottom, left, in points. */
  pad: [number, number, number, number];
  children: ReactNode;
}) {
  return (
    <div className="@container w-full">
      <div
        className="relative overflow-hidden bg-print-ground text-print-ink"
        style={
          {
            '--pt': 'calc(100cqw / 612)',
            '--figures': FIGURES[template],
            minHeight: pt(792),
            padding: pad.map(pt).join(' '),
            fontFamily: FACE[template],
            fontSize: pt(template === 'classic' ? 10.5 : 9.5),
            lineHeight: 1.5,
            fontVariantNumeric:
              template === 'classic' ? undefined : 'tabular-nums',
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

const fig: CSSProperties = { fontFamily: 'var(--figures)' };
const money = (n: number | null, cur: string) => formatCurrency(n, cur);
const lines = (...parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join('\n');
const period = (p: PaperInvoice['period']) =>
  p ? `${shortDate(p.start)} – ${shortDate(p.end)}` : null;

function split(inv: PaperInvoice) {
  const all = inv.lines ?? [];
  return {
    services: all.filter((l) => l.unit !== 'expense'),
    expenses: all.filter((l) => l.unit === 'expense'),
  };
}

/** The rows above the total, as the PDF prints them. */
function totalRows(inv: PaperInvoice) {
  const { services, expenses } = split(inv);
  const rows: { label: string; value: string }[] = [];
  if (services.length > 0 || expenses.length === 0)
    rows.push({
      label: expenses.length > 0 ? 'Services' : 'Subtotal',
      value: money(inv.subtotal, inv.currency),
    });
  if (inv.taxRate > 0)
    rows.push({
      label: `Tax (${inv.taxRate}%)`,
      value: money(inv.taxAmount, inv.currency),
    });
  if (expenses.length > 0)
    rows.push({
      label: 'Expenses',
      value: money(inv.expensesSubtotal, inv.currency),
    });
  return rows;
}

const paymentTitle = (p: PaymentDetails) =>
  p.title ? `Payment — ${p.title}` : 'Payment details';

/** A draft's line its last PDF didn't have: the reason Mark sent waits. */
const NEW = 'bg-print-added';

function Sender({ inv, className }: { inv: PaperInvoice; className?: string }) {
  if (inv.noSender)
    return (
      <p
        className={`rounded border border-dashed border-print-rule text-print-muted ${className ?? ''}`}
        style={{ padding: pt(6) }}
      >
        Your business name and email go here
      </p>
    );
  return null;
}

const Empty = () => (
  <p className="text-print-muted" style={{ marginTop: pt(16) }}>
    Nothing to bill: no billable, un-invoiced time in this period, and no
    expenses or charges.
  </p>
);

// ── Standard ─────────────────────────────────────────────────────────

function Standard({ invoice: inv }: Props) {
  const { services, expenses } = split(inv);
  const cur = inv.currency;
  const label = 'font-bold text-print-faint tracking-[0.12em]';
  const labelSize = { fontSize: pt(7.5) };
  const th = `${label} pb-[0.6em] border-b border-print-ink`;
  return (
    <Sheet template="standard" pad={[40, 44, 48, 44]}>
      <div
        className="flex justify-between gap-6"
        style={{ marginBottom: pt(24) }}
      >
        <div className="max-w-[55%] whitespace-pre-line">
          <Sender inv={inv} />
          {inv.noSender ? null : (
            <>
              <b className="block" style={{ fontSize: pt(13) }}>
                {inv.business?.name ?? 'Invoice'}
              </b>
              <span className="text-print-muted" style={{ fontSize: pt(9) }}>
                {lines(inv.business?.address, inv.business?.email)}
              </span>
            </>
          )}
        </div>
        <div className="text-right">
          <div
            className="font-bold"
            style={{ fontSize: pt(22), lineHeight: 1.15 }}
          >
            INVOICE
          </div>
          <div
            className="text-print-muted"
            style={{ ...fig, fontSize: pt(11) }}
          >
            {inv.number}
          </div>
        </div>
      </div>
      <div
        className="flex justify-between gap-6"
        style={{ marginBottom: pt(20) }}
      >
        <div className="max-w-[46%] whitespace-pre-line">
          <div className={label} style={labelSize}>
            BILL TO
          </div>
          <b>{inv.client.name}</b>
          <div className="text-print-muted" style={{ fontSize: pt(9) }}>
            {lines(inv.client.address, inv.client.email)}
          </div>
        </div>
        <div className="flex flex-col items-end" style={{ gap: pt(10) }}>
          <div className="flex text-right" style={{ gap: pt(28) }}>
            <div>
              <div className={label} style={labelSize}>
                ISSUED
              </div>
              {shortDate(inv.issued)}
            </div>
            <div>
              <div className={label} style={labelSize}>
                DUE
              </div>
              <b>{inv.due ? shortDate(inv.due) : '—'}</b>
            </div>
          </div>
          {inv.period ? (
            <div className="text-right">
              <div className={label} style={labelSize}>
                SERVICE PERIOD
              </div>
              <span className="text-print-muted">{period(inv.period)}</span>
            </div>
          ) : null}
          {inv.reference ? (
            <div className="max-w-[60%] text-right">
              <div className={label} style={labelSize}>
                REFERENCE
              </div>
              <span className="text-print-muted">{inv.reference}</span>
            </div>
          ) : null}
        </div>
      </div>
      {inv.lines?.length === 0 ? <Empty /> : null}
      {inv.lines?.length ? (
        <table className="w-full">
          {services.length > 0 || expenses.length === 0 ? (
            <>
              <thead>
                <tr style={labelSize}>
                  <th className={`${th} text-left`}>DESCRIPTION</th>
                  <th className={`${th} text-right`}>QTY</th>
                  <th className={`${th} text-right`}>RATE</th>
                  <th className={`${th} text-right`}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {services.map((l, i) => (
                  <tr
                    key={i}
                    className={`border-b border-print-rule ${l.isNew ? NEW : ''}`}
                  >
                    <td className="py-[0.58em]">{l.description}</td>
                    <td className="text-right" style={fig}>
                      {formatQuantity(l.unit, l.quantity)}
                    </td>
                    <td className="text-right" style={fig}>
                      {money(l.unitPrice, cur)}
                    </td>
                    <td className="text-right" style={fig}>
                      {money(l.amount, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
          {expenses.length > 0 ? (
            <>
              <thead>
                <tr style={labelSize}>
                  <th className={`${th} pt-[1.5em] text-left`}>EXPENSES</th>
                  <th className={`${th} pt-[1.5em] text-right`} colSpan={2}>
                    DATE
                  </th>
                  <th className={`${th} pt-[1.5em] text-right`}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((l, i) => (
                  <tr
                    key={i}
                    className={`border-b border-print-rule ${l.isNew ? NEW : ''}`}
                  >
                    <td className="py-[0.58em]">{l.description}</td>
                    <td className="text-right" colSpan={2} style={fig}>
                      {shortDate(l.spentOn ?? null)}
                    </td>
                    <td className="text-right" style={fig}>
                      {money(l.amount, cur)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </table>
      ) : null}
      {inv.lines?.length ? (
        <div className="ml-auto" style={{ width: pt(250), marginTop: pt(12) }}>
          {totalRows(inv).map((r) => (
            <div key={r.label} className="flex justify-between py-[0.3em]">
              <span className="text-print-muted">{r.label}</span>
              <span style={fig}>{r.value}</span>
            </div>
          ))}
          <div
            className="flex items-baseline justify-between border-t border-print-ink"
            style={{ marginTop: pt(7), paddingTop: pt(9) }}
          >
            <b style={{ fontSize: pt(11) }}>Amount due</b>
            <b
              className="text-print-accent"
              style={{ ...fig, fontSize: pt(13) }}
            >
              {money(inv.total, cur)}
            </b>
          </div>
          {inv.terms ? (
            <div
              className="text-print-faint"
              style={{ fontSize: pt(8.5), marginTop: pt(6) }}
            >
              {inv.terms}
            </div>
          ) : null}
        </div>
      ) : null}
      {inv.payment ? (
        <div
          className="border-l-2 border-print-ink bg-print-band"
          style={{ marginTop: pt(16), padding: pt(11) }}
        >
          {/* Faint ink is too light for the band; its labels are muted. */}
          <PaymentBody
            payment={inv.payment}
            label="font-bold tracking-[0.12em] text-print-muted"
            cols={3}
          />
        </div>
      ) : null}
      {inv.notes ? (
        <div style={{ marginTop: pt(12) }}>
          <div className={label} style={labelSize}>
            NOTES
          </div>
          <p className="whitespace-pre-line text-print-muted">{inv.notes}</p>
        </div>
      ) : null}
    </Sheet>
  );
}

function PaymentBody({
  payment,
  label,
  cols,
  title = paymentTitle(payment),
  titleClass = 'font-bold',
}: {
  payment: PaymentDetails;
  label: string;
  cols: number;
  title?: string;
  titleClass?: string;
}) {
  const grid = (fields: PaymentDetails['fields']) => (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${pt(5)} ${pt(10)}`,
        marginTop: pt(7),
      }}
    >
      {fields.map((f) => (
        <div key={f.label}>
          <div className={label} style={{ fontSize: pt(7) }}>
            {f.label.toUpperCase()}
          </div>
          <div style={fig}>{f.value}</div>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <div className={titleClass}>{title}</div>
      {grid(payment.fields)}
      {payment.intermediary.length > 0 ? grid(payment.intermediary) : null}
      {payment.link ? (
        <p className="break-all text-print-accent" style={{ marginTop: pt(8) }}>
          {payment.link.label}: {payment.link.url}
        </p>
      ) : null}
      {payment.notes ? (
        <p
          className="whitespace-pre-line text-print-muted"
          style={{ marginTop: pt(8), fontSize: pt(8.5) }}
        >
          {payment.notes}
        </p>
      ) : null}
    </>
  );
}

// ── Modern ───────────────────────────────────────────────────────────

function AccentRule({ style }: { style?: CSSProperties }) {
  return (
    <div className="relative bg-print-rule" style={{ height: pt(1), ...style }}>
      <div
        className="absolute left-0 bg-print-accent"
        style={{ top: pt(-1), width: pt(56), height: pt(3) }}
      />
    </div>
  );
}

function Modern({ invoice: inv }: Props) {
  const { services, expenses } = split(inv);
  const cur = inv.currency;
  const label = 'font-medium tracking-[0.16em] text-print-faint';
  const ls = { fontSize: pt(7.5) };
  const th = `${label} pb-[0.7em] border-b border-print-rule`;
  const row = (l: Line, cells: ReactNode) => (
    <tr className={`border-b border-print-hairline ${l.isNew ? NEW : ''}`}>
      <td className="py-[0.68em]">{l.description}</td>
      {cells}
      <td className="text-right">{money(l.amount, cur)}</td>
    </tr>
  );
  return (
    <Sheet template="modern" pad={[46, 52, 52, 52]}>
      <div
        className="flex items-end justify-between gap-6"
        style={{ paddingBottom: pt(16) }}
      >
        <div>
          <div style={{ fontSize: pt(34), fontWeight: 300, lineHeight: 1.1 }}>
            Invoice
          </div>
          <div className="text-print-muted" style={{ fontSize: pt(10) }}>
            {inv.number}
          </div>
        </div>
        <div className="max-w-[50%] whitespace-pre-line text-right">
          <Sender inv={inv} />
          {inv.noSender ? null : (
            <>
              <div className="font-semibold" style={{ fontSize: pt(12) }}>
                {inv.business?.name}
              </div>
              <span className="text-print-muted">
                {lines(inv.business?.address, inv.business?.email)}
              </span>
            </>
          )}
        </div>
      </div>
      <AccentRule style={{ marginBottom: pt(20) }} />
      <div className="flex" style={{ gap: pt(20) }}>
        <div className="flex-[1.6] whitespace-pre-line">
          <div className={label} style={ls}>
            BILLED TO
          </div>
          <b className="font-semibold">{inv.client.name}</b>
          <div className="text-print-muted">
            {lines(inv.client.address, inv.client.email)}
          </div>
        </div>
        <div className="flex-1">
          <div className={label} style={ls}>
            ISSUED
          </div>
          {shortDate(inv.issued)}
        </div>
        <div className="flex-1">
          <div className={label} style={ls}>
            DUE
          </div>
          {inv.due ? shortDate(inv.due) : '—'}
        </div>
        <div className="flex-[1.3] text-right">
          <div className={label} style={ls}>
            AMOUNT DUE
          </div>
          <div
            className="font-medium text-print-accent"
            style={{ fontSize: pt(22), lineHeight: 1.2 }}
          >
            {money(inv.total, cur)}
          </div>
        </div>
      </div>
      {inv.period || inv.reference ? (
        <div
          className="flex border-t border-print-hairline"
          style={{ gap: pt(20), marginTop: pt(14), paddingTop: pt(12) }}
        >
          {inv.period ? (
            <div className="flex-[1.6]">
              <span className={label} style={{ ...ls, marginRight: pt(8) }}>
                PERIOD
              </span>
              {period(inv.period)}
            </div>
          ) : null}
          {inv.reference ? (
            <div className="flex-[2.3]">
              <span className={label} style={{ ...ls, marginRight: pt(8) }}>
                REFERENCE
              </span>
              {inv.reference}
            </div>
          ) : null}
        </div>
      ) : null}
      {inv.lines?.length === 0 ? <Empty /> : null}
      {inv.lines?.length ? (
        <table className="w-full" style={{ marginTop: pt(22) }}>
          {services.length > 0 || expenses.length === 0 ? (
            <>
              <thead>
                <tr style={ls}>
                  <th className={`${th} text-left`}>DESCRIPTION</th>
                  <th className={`${th} text-right`}>QTY</th>
                  <th className={`${th} text-right`}>RATE</th>
                  <th className={`${th} text-right`}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {services.map((l, i) => (
                  <Frag key={i}>
                    {row(
                      l,
                      <>
                        <td className="text-right">
                          {formatQuantity(l.unit, l.quantity)}
                        </td>
                        <td className="text-right">
                          {money(l.unitPrice, cur)}
                        </td>
                      </>,
                    )}
                  </Frag>
                ))}
              </tbody>
            </>
          ) : null}
          {expenses.length > 0 ? (
            <>
              <thead>
                <tr style={ls}>
                  <th className={`${th} pt-[1.7em] text-left`}>EXPENSES</th>
                  <th className={`${th} pt-[1.7em] text-right`} colSpan={2}>
                    DATE
                  </th>
                  <th className={`${th} pt-[1.7em] text-right`}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((l, i) => (
                  <Frag key={i}>
                    {row(
                      l,
                      <td className="text-right" colSpan={2}>
                        {shortDate(l.spentOn ?? null)}
                      </td>,
                    )}
                  </Frag>
                ))}
              </tbody>
            </>
          ) : null}
        </table>
      ) : null}
      {inv.lines?.length ? (
        <div
          className="flex items-start"
          style={{ gap: pt(36), marginTop: pt(18) }}
        >
          <div className="flex-1">
            {inv.payment ? (
              <PaymentBody
                payment={inv.payment}
                label={label}
                cols={2}
                titleClass="font-semibold"
              />
            ) : null}
          </div>
          <div style={{ width: pt(230) }}>
            {totalRows(inv).map((r) => (
              <div key={r.label} className="flex justify-between py-[0.3em]">
                <span className="text-print-muted">{r.label}</span>
                <span>{r.value}</span>
              </div>
            ))}
            <div
              className="flex justify-between border-t border-print-ink font-semibold"
              style={{ marginTop: pt(6), paddingTop: pt(9), fontSize: pt(11) }}
            >
              <span>Amount due</span>
              <span className="text-print-accent">{money(inv.total, cur)}</span>
            </div>
            {inv.terms ? (
              <div
                className="text-print-faint"
                style={{ fontSize: pt(8.5), marginTop: pt(6) }}
              >
                {inv.terms}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {inv.notes ? (
        <p
          className="whitespace-pre-line border-t border-print-hairline text-print-muted"
          style={{ marginTop: pt(26), paddingTop: pt(14) }}
        >
          {inv.notes}
        </p>
      ) : null}
    </Sheet>
  );
}

const Frag = ({ children }: { children: ReactNode }) => <>{children}</>;

// ── Classic ──────────────────────────────────────────────────────────

const CAPS = 'uppercase tracking-[0.17em] text-print-muted';

function Classic({ invoice: inv }: Props) {
  const { services, expenses } = split(inv);
  const cur = inv.currency;
  const caps = { fontSize: pt(8) };
  const aside = (l: Line) =>
    l.unit === 'expense'
      ? shortDate(l.spentOn ?? null)
      : l.unit === 'fixed' && l.quantity === 1
        ? 'fixed fee'
        : `${formatQuantity(l.unit, l.quantity)} at ${money(l.unitPrice, cur)}`;
  const leaders = (items: Line[]) =>
    items.map((l, i) => (
      <div
        key={i}
        className={`flex items-end ${l.isNew ? NEW : ''}`}
        style={{ padding: `${pt(3.5)} 0` }}
      >
        <span>{l.description}</span>
        <span
          className="flex-none text-print-muted"
          style={{ marginLeft: pt(6) }}
        >
          {aside(l)}
        </span>
        <span
          className="min-w-[1em] grow border-b border-dotted border-print-rule"
          style={{ margin: `0 ${pt(6)} ${pt(4)}` }}
        />
        <span className="flex-none">{money(l.amount, cur)}</span>
      </div>
    ));
  const kv: [string, string][] = [
    ['Issued', shortDate(inv.issued)],
    ['Due', inv.due ? shortDate(inv.due) : '—'],
    ...(inv.period
      ? [['Period', period(inv.period) as string] as [string, string]]
      : []),
    ...(inv.reference
      ? [['Reference', inv.reference] as [string, string]]
      : []),
  ];
  return (
    <Sheet template="classic" pad={[44, 52, 52, 52]}>
      <div className="flex flex-col items-center text-center">
        <div className="italic" style={{ fontSize: pt(26), lineHeight: 1.15 }}>
          Invoice
        </div>
        <div className={CAPS} style={caps}>
          No. {inv.number}
        </div>
        <div
          className="bg-print-accent"
          style={{ width: pt(160), height: pt(1.25), margin: `${pt(14)} 0` }}
        />
        <Sender inv={inv} />
        {inv.noSender ? null : (
          <>
            <div
              className="uppercase tracking-[0.18em]"
              style={{ fontSize: pt(13) }}
            >
              {inv.business?.name}
            </div>
            <div className="text-print-muted">
              {[
                ...(inv.business?.address?.split('\n') ?? []),
                inv.business?.email,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </>
        )}
      </div>
      <div
        className="flex justify-between border-t border-print-rule"
        style={{
          gap: pt(24),
          marginTop: pt(20),
          marginBottom: pt(18),
          paddingTop: pt(14),
        }}
      >
        <div className="max-w-[45%] whitespace-pre-line">
          <div className={CAPS} style={caps}>
            Billed to
          </div>
          <div>{inv.client.name}</div>
          <div className="text-print-muted">
            {lines(inv.client.address, inv.client.email)}
          </div>
        </div>
        <div
          className="grid max-w-[55%] grid-cols-[auto_auto] items-baseline text-right"
          style={{ gap: `${pt(1)} ${pt(12)}` }}
        >
          {kv.map(([k, v]) => (
            <Frag key={k}>
              <span className={CAPS} style={caps}>
                {k}
              </span>
              <span>{v}</span>
            </Frag>
          ))}
        </div>
      </div>
      {inv.lines?.length === 0 ? <Empty /> : null}
      {services.length > 0 ? (
        <>
          <div
            className="uppercase tracking-[0.17em] text-print-accent"
            style={{ ...caps, marginTop: pt(10) }}
          >
            Services
          </div>
          {leaders(services)}
        </>
      ) : null}
      {expenses.length > 0 ? (
        <>
          <div
            className="uppercase tracking-[0.17em] text-print-accent"
            style={{ ...caps, marginTop: pt(10) }}
          >
            Expenses
          </div>
          {leaders(expenses)}
        </>
      ) : null}
      {inv.lines?.length ? (
        <div className="ml-auto" style={{ width: pt(240), marginTop: pt(12) }}>
          {totalRows(inv).map((r) => (
            <div key={r.label} className="flex justify-between py-[0.2em]">
              <span className="text-print-muted">{r.label}</span>
              <span>{r.value}</span>
            </div>
          ))}
          <div
            className="flex items-baseline justify-between border-t border-print-ink"
            style={{ marginTop: pt(6), paddingTop: pt(8) }}
          >
            <span
              className="uppercase tracking-[0.14em]"
              style={{ fontSize: pt(10) }}
            >
              Balance due
            </span>
            <span className="text-print-accent" style={{ fontSize: pt(13) }}>
              {money(inv.total, cur)}
            </span>
          </div>
          {inv.terms ? (
            <div
              className="text-print-muted"
              style={{ marginTop: pt(4), fontSize: pt(9.5) }}
            >
              {inv.terms}
            </div>
          ) : null}
        </div>
      ) : null}
      {inv.payment ? (
        <div
          className="border-t border-print-rule"
          style={{ marginTop: pt(20), paddingTop: pt(12) }}
        >
          <PaymentBody
            payment={inv.payment}
            label={CAPS}
            cols={3}
            titleClass="uppercase tracking-[0.14em]"
          />
        </div>
      ) : null}
      {inv.notes ? (
        <p className="whitespace-pre-line" style={{ marginTop: pt(14) }}>
          {inv.notes}
        </p>
      ) : null}
    </Sheet>
  );
}

// ── Creative ─────────────────────────────────────────────────────────

/** The page's three shapes, each marking one kind of line or table. */
export const MARK = {
  circle: (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 10 10"
      aria-hidden
      className="flex-none text-print-accent"
    >
      <circle cx="5" cy="5" r="5" fill="currentColor" />
    </svg>
  ),
  square: (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 10 10"
      aria-hidden
      className="flex-none text-print-accent"
    >
      <rect
        x=".5"
        y=".5"
        width="9"
        height="9"
        fill="currentColor"
        transform="rotate(12 5 5)"
      />
    </svg>
  ),
  triangle: (
    <svg
      width="1.1em"
      height="1em"
      viewBox="0 0 11 10"
      aria-hidden
      className="flex-none text-print-accent"
    >
      <path d="M5.5 0 11 10H0Z" fill="currentColor" />
    </svg>
  ),
};

function Spine({ number }: { number: string }) {
  return (
    <div
      className="absolute origin-top-left rotate-90 whitespace-nowrap font-bold text-print-faint"
      style={{
        left: pt(34),
        top: pt(48),
        fontSize: pt(8),
        letterSpacing: pt(4),
      }}
    >
      INVOICE — {number}
    </div>
  );
}

function Creative({ invoice: inv }: Props) {
  const cur = inv.currency;
  const label = 'font-bold tracking-[0.19em] text-print-faint';
  const ls = { fontSize: pt(7.5) };
  const all = inv.lines ?? [];
  let n = 0;
  const kinds = [
    {
      title: 'TIME',
      mark: MARK.circle,
      items: all.filter((l) => l.unit === 'hour'),
    },
    {
      title: 'FIXED FEES',
      mark: MARK.square,
      items: all.filter((l) => l.unit === 'fixed'),
    },
    {
      title: 'EXPENSES',
      mark: MARK.triangle,
      items: all.filter((l) => l.unit === 'expense'),
    },
  ]
    .filter((k) => k.items.length > 0)
    .map((k) => ({
      ...k,
      sum: k.items.reduce((t, l) => t + l.amount, 0),
      rows: k.items.map((l) => ({ l, n: ++n })),
    }));
  const aside = (l: Line) =>
    l.unit === 'expense'
      ? shortDate(l.spentOn ?? null)
      : l.unit === 'fixed' && l.quantity === 1
        ? 'Fixed'
        : `${formatQuantity(l.unit, l.quantity)} × ${money(l.unitPrice, cur)}`;
  return (
    <Sheet template="creative" pad={[48, 52, 52, 76]}>
      <Spine number={inv.number} />
      <svg
        className="absolute text-print-ink"
        style={{
          top: pt(-62),
          right: pt(-40),
          width: pt(230),
          height: pt(204),
        }}
        viewBox="0 0 260 230"
        aria-hidden
      >
        <circle
          cx="170"
          cy="90"
          r="88"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="86"
          y="118"
          width="70"
          height="70"
          fill="currentColor"
          transform="rotate(12 121 153)"
        />
        <circle cx="210" cy="176" r="22" className="fill-print-accent" />
        <path
          d="M40 200 L74 140 L108 200 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <div className="relative" style={{ maxWidth: pt(300) }}>
        <Sender inv={inv} />
        {inv.noSender ? null : (
          <>
            <div
              className="font-bold"
              style={{
                fontSize: pt(26),
                letterSpacing: pt(-1),
                lineHeight: 1.1,
              }}
            >
              {inv.business?.name}
            </div>
            <div
              className="whitespace-pre-line text-print-muted"
              style={{ marginTop: pt(6) }}
            >
              {lines(
                inv.business?.address?.split('\n').join(', '),
                inv.business?.email,
              )}
            </div>
          </>
        )}
      </div>
      <div
        className="flex items-center"
        style={{ gap: pt(28), margin: `${pt(20)} 0 ${pt(12)}` }}
      >
        <div
          className="relative flex flex-none flex-col items-center justify-center rounded-full border-print-ink"
          style={{ width: pt(134), height: pt(134), borderWidth: pt(2) }}
        >
          <span
            className="absolute rounded-full bg-print-accent"
            style={{ top: pt(8), right: pt(14), width: pt(14), height: pt(14) }}
          />
          <span className={label} style={ls}>
            AMOUNT DUE
          </span>
          <span className="font-semibold" style={{ ...fig, fontSize: pt(16) }}>
            {money(inv.total, cur)}
          </span>
          {inv.due ? (
            <span className="text-print-muted">by {shortDate(inv.due)}</span>
          ) : null}
        </div>
        <div
          className="grid flex-1 grid-cols-2 border-print-ink"
          style={{ borderTopWidth: pt(2) }}
        >
          {[
            [
              'BILLED TO',
              <>
                <b>{inv.client.name}</b>
                <div className="text-print-muted">
                  {inv.client.address?.split('\n').join(', ')}
                </div>
              </>,
            ],
            ['ISSUED', shortDate(inv.issued)],
            ...(inv.period ? [['PERIOD', period(inv.period)]] : []),
            ['DUE', <b key="d">{inv.due ? shortDate(inv.due) : '—'}</b>],
          ].map(([k, v]) => (
            <div
              key={k as string}
              className="border-b border-print-rule"
              style={{ padding: `${pt(7)} ${pt(12)} ${pt(7)} 0` }}
            >
              <div className={label} style={ls}>
                {k}
              </div>
              {v}
            </div>
          ))}
          {inv.reference ? (
            <div
              className="col-span-2 border-b border-print-rule"
              style={{ padding: `${pt(7)} 0` }}
            >
              <div className={label} style={ls}>
                REFERENCE
              </div>
              {inv.reference}
            </div>
          ) : null}
        </div>
      </div>
      {inv.lines?.length === 0 ? <Empty /> : null}
      {kinds.map((k) => (
        <div key={k.title}>
          <div
            className="flex items-center"
            style={{
              gap: pt(8),
              margin: `${pt(9)} 0 ${pt(1)}`,
              fontSize: pt(10),
            }}
          >
            {k.mark}
            <span className={label} style={ls}>
              {k.title}
            </span>
            <span
              className="ml-auto text-print-muted"
              style={{ ...fig, fontSize: pt(9.5) }}
            >
              {money(k.sum, cur)}
            </span>
          </div>
          {k.rows.map(({ l, n }) => (
            <div
              key={n}
              className={`flex items-baseline border-b border-print-hairline ${l.isNew ? NEW : ''}`}
              style={{ gap: pt(10), padding: `${pt(4)} 0` }}
            >
              <span
                className="font-semibold text-print-faint"
                style={{ ...fig, width: pt(30), fontSize: pt(13) }}
              >
                {String(n).padStart(2, '0')}
              </span>
              <span className="flex-1">
                <b>{l.description}</b>{' '}
                <span className="text-print-muted">{aside(l)}</span>
              </span>
              <span
                className="text-right font-semibold"
                style={{ ...fig, width: pt(100) }}
              >
                {money(l.amount, cur)}
              </span>
            </div>
          ))}
        </div>
      ))}
      {inv.lines?.length ? (
        <div className="ml-auto" style={{ width: pt(230), marginTop: pt(12) }}>
          {totalRows(inv).map((r) => (
            <div key={r.label} className="flex justify-between py-[0.3em]">
              <span className="text-print-muted">{r.label}</span>
              <span style={fig}>{r.value}</span>
            </div>
          ))}
          <div
            className="flex justify-between border-print-ink font-bold"
            style={{
              borderTopWidth: pt(2),
              marginTop: pt(6),
              paddingTop: pt(8),
              fontSize: pt(11),
            }}
          >
            <span>Total</span>
            <span style={fig}>{money(inv.total, cur)}</span>
          </div>
          {inv.terms ? (
            <div
              className="text-print-faint"
              style={{ fontSize: pt(8.5), marginTop: pt(6) }}
            >
              {inv.terms}
            </div>
          ) : null}
        </div>
      ) : null}
      {inv.payment ? (
        <div
          className="border-dashed border-print-ink"
          style={{
            marginTop: pt(16),
            padding: `${pt(12)} ${pt(18)} ${pt(12)} ${pt(26)}`,
            borderWidth: pt(1.5),
            borderRadius: pt(10),
          }}
        >
          <PaymentBody payment={inv.payment} label={label} cols={3} />
        </div>
      ) : null}
      {inv.notes ? (
        <p
          className="whitespace-pre-line text-print-muted"
          style={{ marginTop: pt(12) }}
        >
          {inv.notes}
        </p>
      ) : null}
    </Sheet>
  );
}

const PAPERS: Record<InvoiceTemplate, (p: Props) => ReactNode> = {
  standard: Standard,
  modern: Modern,
  classic: Classic,
  creative: Creative,
};

/** Page 1 of the invoice, in `template`. */
export function InvoicePaper({
  template,
  invoice,
}: {
  template: InvoiceTemplate;
  invoice: PaperInvoice;
}) {
  const Paper = PAPERS[template];
  return <Paper invoice={invoice} />;
}

// ── Supporting detail ────────────────────────────────────────────────

const TABLE_MARK = {
  project: MARK.circle,
  week: MARK.square,
  date: MARK.triangle,
};

function rows(detail: Schedules, kind: ScheduleKind): string[][] {
  switch (kind) {
    case 'project':
      return (detail.project ?? []).map((r) => [
        r.project,
        formatHours(r.hours),
      ]);
    case 'week':
      return (detail.week ?? []).map((r) => [
        `${shortDate(r.start)} – ${shortDate(r.end)}`,
        formatHours(r.hours),
      ]);
    case 'date':
      return (detail.date ?? []).map((r) => [
        shortDate(r.date),
        r.project,
        formatHours(r.hours),
      ]);
  }
}

/** Page 2 onward, drawn as one page: hours only, never money. */
export function DetailPaper({
  template,
  detail,
  chosen,
  heading,
}: {
  template: InvoiceTemplate;
  detail: Schedules;
  chosen: ScheduleKind[];
  /** The running header's number, client and period. */
  heading: string;
}) {
  const kinds = SCHEDULE_KINDS.filter((k) => chosen.includes(k));
  const look = {
    standard: {
      title: 'font-bold',
      run: 'font-bold',
      th: 'font-bold tracking-[0.12em] text-print-faint',
      rule: 'border-print-ink',
      sum: 'font-bold',
    },
    modern: {
      title: 'font-medium tracking-[0.16em] uppercase text-print-faint',
      run: 'font-light',
      th: 'font-medium tracking-[0.16em] text-print-faint',
      rule: 'border-print-rule',
      sum: 'font-semibold',
    },
    classic: {
      title: 'uppercase tracking-[0.17em] text-print-accent',
      run: 'uppercase tracking-[0.17em]',
      th: CAPS,
      rule: 'border-print-ink',
      sum: 'uppercase tracking-[0.14em]',
    },
    creative: {
      title: 'font-bold uppercase tracking-[0.19em] text-print-faint',
      run: 'font-bold',
      th: 'font-bold tracking-[0.19em] text-print-faint',
      rule: 'border-print-rule',
      sum: 'font-bold',
    },
  }[template];
  const runSize = { standard: 9.5, modern: 24, classic: 10, creative: 22 }[
    template
  ];
  return (
    <Sheet
      template={template}
      pad={template === 'creative' ? [48, 52, 52, 76] : [44, 52, 52, 52]}
    >
      {template === 'creative' ? (
        <Spine number={heading.split(' · ')[0] ?? ''} />
      ) : null}
      <div
        className={`flex items-end justify-between border-b ${template === 'creative' ? 'border-print-ink' : look.rule}`}
        style={{
          paddingBottom: pt(8),
          marginBottom: pt(18),
          borderBottomWidth: template === 'creative' ? pt(2) : undefined,
        }}
      >
        <span
          className={look.run}
          style={{ fontSize: pt(runSize), lineHeight: 1.15 }}
        >
          Supporting detail
        </span>
        <span className="text-print-muted" style={{ fontSize: pt(8.5) }}>
          {heading}
        </span>
      </div>
      {kinds.map((kind) => (
        <div key={kind} style={{ marginBottom: pt(18) }}>
          <div
            className={`flex items-center ${look.title}`}
            style={{
              gap: pt(8),
              marginBottom: pt(6),
              fontSize: pt(template === 'standard' ? 11 : 8),
            }}
          >
            {template === 'creative' ? TABLE_MARK[kind] : null}
            {SCHEDULE_TITLES[kind]}
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ fontSize: pt(7.5) }}>
                {(kind === 'date'
                  ? ['DATE', 'PROJECT']
                  : [kind === 'week' ? 'WEEK' : 'PROJECT']
                ).map((h) => (
                  <th
                    key={h}
                    className={`${look.th} border-b ${look.rule} pb-[0.5em] text-left`}
                  >
                    {h}
                  </th>
                ))}
                <th
                  className={`${look.th} border-b ${look.rule} pb-[0.5em] text-right`}
                >
                  HOURS
                </th>
              </tr>
            </thead>
            <tbody>
              {rows(detail, kind).map((cells, i) => (
                <tr key={i} className="border-b border-print-hairline">
                  {cells.map((c, j) => (
                    <td
                      key={j}
                      className={
                        j === cells.length - 1
                          ? 'text-right'
                          : 'py-[0.35em] pr-[1em]'
                      }
                      style={j === cells.length - 1 ? fig : undefined}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className={look.sum}>
                <td
                  colSpan={kind === 'date' ? 2 : 1}
                  className={`border-t ${look.rule}`}
                  style={{ paddingTop: pt(5) }}
                >
                  Total
                </td>
                <td
                  className={`border-t ${look.rule} text-right`}
                  style={{ ...fig, paddingTop: pt(5) }}
                >
                  {formatHours(detail.totalHours)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </Sheet>
  );
}
