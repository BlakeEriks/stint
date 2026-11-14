'use client';

import {
  formatCurrency,
  formatHours,
  formatQuantity,
  type PaymentDetails,
  paymentTermsText,
  SCHEDULE_KINDS,
  SCHEDULE_TITLES,
  type ScheduleKind,
  type Schedules,
} from '@stint/core';
import { Pencil, Plus } from 'lucide-react';
import type {
  Client,
  Expense,
  Invoice,
  InvoicePreview,
  Settings,
} from '@/lib/client/api';
import { shortDate } from './invoice-bits';
import { rowBleed, rowButton } from './row-button';
import { useScrollerFocus } from '@/lib/client/use-scroller-focus';

type Business = Pick<Invoice['business'], 'name' | 'address' | 'email'>;

/** The From block generation will freeze, from settings as they are now. */
export function businessOf(settings: Settings): Invoice['business'];
export function businessOf(
  settings: Settings | undefined,
): Invoice['business'] | undefined;
export function businessOf(settings: Settings | undefined) {
  if (!settings) return undefined;
  return {
    name: settings.businessName,
    address: settings.businessAddress,
    email: settings.businessEmail,
    logoUrl: settings.logoUrl,
  };
}

const LABEL = 'block type-label text-subtle';

/** What the card prints from: a preview, or an issued invoice. Lines are
    absent while an issued one is still loading them. */
export type CardFigures = Pick<
  InvoicePreview,
  | 'periodStart'
  | 'periodEnd'
  | 'subtotal'
  | 'taxRate'
  | 'taxAmount'
  | 'expensesSubtotal'
  | 'total'
  | 'currency'
  | 'schedules'
> & {
  lineItems?: Array<
    Pick<
      InvoicePreview['lineItems'][number],
      'description' | 'unit' | 'quantity' | 'unitPrice' | 'amount' | 'spentOn'
    > & { expenseId?: string }
  >;
};

/** Text the user types where it prints. */
type Typed = { value: string; onChange: (value: string) => void };

/**
 * What New invoice edits on the page, each where it prints. Absent, the card
 * is the invoice as issued, with nothing to press.
 */
export type CardEdits = {
  /** Absent on a draft, whose sender was frozen when it was made. */
  onBusiness?: () => void;
  onDates: () => void;
  onClient: () => void;
  /** The period is set above the page: the press goes to that control. */
  onPeriod: () => void;
  /** The period chosen on the form, which prints before the server echoes
   *  it. */
  period: { periodStart: string; periodEnd: string };
  reference: Typed;
  notes: Typed;
  /** With one summary line: its text, typed on the line. */
  summary?: Typed & { invalid: boolean };
  /** With one summary line: the supporting detail it attaches. */
  schedules?: { onChange: (value: ScheduleKind[]) => void };
  charges: {
    list: { key: string; description: string; amount: number }[];
    onOpen: (key: string) => void;
    onAdd: () => void;
  };
  expenses: {
    /** The client's waiting expenses this invoice can bill. */
    waiting: Expense[];
    excluded: string[];
    onToggle: (id: string, bill: boolean) => void;
    onOpen: (expense: Expense) => void;
    onAdd: () => void;
  };
  /** The invoice's, for the charges before the server's first answer. */
  currency: string;
  /** Wraps the payment block, or its add button, in the menu it opens. */
  paymentMenu: (trigger: React.ReactElement) => React.ReactNode;
};

/**
 * The invoice as its PDF prints it, line for line: the form itself on New
 * invoice, and as issued on its detail page.
 *
 * The lines, totals and schedules are the server's answer; the rest — the
 * business block, the number, the dates, the payment block, which schedules
 * are ticked — is known here and shows in the same frame as the change that
 * set it. While the server recomputes, the figures dim rather than showing a
 * guess.
 *
 * With `edit`, what can change is pressed or typed where it prints. Nothing
 * dashed, no pencil and no tick prints.
 */
export function InvoicePreviewCard({
  preview,
  client,
  business,
  number,
  issued,
  due,
  reference,
  payment,
  schedules,
  updating,
  paymentTerms,
  notes,
  heading = true,
  noSender = false,
  edit,
}: {
  preview: CardFigures | undefined;
  /** Undefined on New invoice before one is chosen. */
  client: Pick<Client, 'name' | 'address' | 'email'> | undefined;
  /** Undefined while it loads. */
  business: Business | undefined;
  /** A prediction: generation allocates the number. */
  number: string;
  issued: string;
  due: string;
  reference: string;
  payment: PaymentDetails | null;
  schedules: ScheduleKind[];
  updating: boolean;
  /** Undefined prints the terms generation will freeze, made from `issued`
   *  and `due`. */
  paymentTerms?: string | null;
  notes?: string | null;
  /** False on an issued invoice, which is the invoice, not a preview of it. */
  heading?: boolean;
  /** No business name or email yet: a draft marks where they will print. */
  noSender?: boolean;
  edit?: CardEdits;
}) {
  const terms =
    paymentTerms === undefined ? termsFrom(issued, due) : paymentTerms;

  return (
    <section
      aria-labelledby="inv-preview"
      aria-busy={updating}
      tabIndex={useScrollerFocus()}
      // The one scroll on an invoice screen, from `xl` where the panel is
      // bounded: what is above stays, and the sheet moves as a page does,
      // edge and all. It takes the column's margin, so the sheet is cut at
      // the panel's foot and not short of it.
      className="flex flex-col xl:-mx-[18px] xl:-mb-[18px] xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:px-[18px] xl:pb-[18px]"
    >
      {/* Hidden, not dropped: the schedules' headings sit under it. */}
      <h2 id="inv-preview" className="sr-only">
        {heading ? 'Preview' : 'Invoice'}
      </h2>
      {/* New invoice says so beside Save draft; an issued invoice here. */}
      {edit ? null : (
        <p className="px-1 pb-2.5 text-right type-support text-subtle">
          {updating ? 'Updating…' : null}
        </p>
      )}
      <div className={`@container/card flex flex-col gap-5 ${SHEET}`}>
        <Header
          business={business}
          noSender={noSender}
          number={number}
          issued={issued}
          due={due}
          client={client}
          preview={preview}
          reference={reference}
          edit={edit}
        />

        {/* On New invoice what the user edits stands before the server's
            first answer; only the figures wait for it. */}
        {edit || preview?.lineItems ? (
          <Lines
            preview={preview}
            currency={preview?.currency ?? edit?.currency ?? 'USD'}
            terms={terms}
            updating={updating}
            edit={edit}
          />
        ) : null}

        <PaymentBlock payment={payment} edit={edit} />

        {edit ? (
          <TypedNotes notes={edit.notes} />
        ) : notes ? (
          <Notes notes={notes} />
        ) : null}

        <Detail
          detail={preview?.schedules ?? null}
          chosen={schedules}
          updating={updating}
          onChange={edit?.schedules?.onChange}
        />
      </div>
    </section>
  );
}

export const DIM = 'opacity-50';

/** The server's figures, dimmed while it recomputes them; what the user
    types stays as it is. */
function Dims({
  updating,
  children,
}: {
  updating: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-5 transition-opacity duration-150 ${
        updating ? DIM : ''
      }`}
    >
      {children}
    </div>
  );
}

/** The terms generation will freeze, made from `issued` and `due`. */
function termsFrom(issued: string, due: string): string | null {
  return due && due >= issued ? paymentTermsText(issued, due) : null;
}

/** What the user fills in, marked as theirs: it prints only once filled. */
const DASHED =
  'rounded-md border border-dashed border-edge-control text-muted hover:bg-surface-hover hover:text-strong focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

/*
 * The sheet's box model (`.claude/rules/web-ui.md`): text sits on the text
 * margin, and a box around it, highlight or dashed, bleeds 8px past it
 * sideways and 6px above and below. The box is never what the grid places:
 * a plain cell is, and the box bleeds inside it with its own width, so the
 * columns divide alike on every row. A dashed box carries its 1px border
 * inside the same box, so its padding is a pixel less and its text lands
 * where a highlight's does. `inline` sizes a box to its text, for a row of
 * them (`ADD_ROW`), whose gap allows for the bleed. `SheetAligned` in the
 * New invoice stories measures all of this.
 */
const bleed = (inline = false) =>
  `-mx-2 -my-1.5 px-2 py-1.5 ${inline ? '' : 'w-[calc(100%+1rem)]'}`;
const dashedBleed = (inline = false) =>
  `-mx-2 -my-1.5 px-[calc(0.5rem-1px)] py-[calc(0.375rem-1px)] ${
    inline ? '' : 'w-[calc(100%+1rem)]'
  }`;
/** Boxes in a row: 24px apart in the grid, 8px apart as seen. */
const ADD_ROW = 'flex flex-wrap gap-x-6 gap-y-5';
/** Boxes in a column: 16px apart in the grid, 4px apart as seen. */
const STACK = 'flex flex-col gap-4';

/**
 * A block that opens its editor is itself the button (`.claude/rules/
 * web-ui.md`): it highlights whole, and a faint pencil at its top right says
 * so. Without `onPress` it is the block as printed.
 */
function Block({
  onPress,
  className = '',
  children,
}: {
  onPress?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!onPress)
    return <div className={`${bleed()} ${className}`}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onPress}
      className={`${rowButton} ${bleed()} pr-7 ${className}`}
    >
      <span className="sr-only">Edit</span> {children}
      <EditMark />
    </button>
  );
}

function EditMark() {
  return (
    <Pencil
      aria-hidden
      strokeWidth={1.75}
      className="absolute top-2 right-2 size-3.5 text-subtle opacity-60 group-hover:text-strong group-hover:opacity-100"
    />
  );
}

function AddButton({
  label,
  onClick,
  inline = false,
  className = '',
}: {
  label: string;
  onClick?: () => void;
  /** Sized to its text, in an `ADD_ROW`; otherwise it fills its cell. */
  inline?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${DASHED} ${dashedBleed(inline)} flex items-center gap-1.5 type-support ${className}`}
    >
      <Plus aria-hidden strokeWidth={2.25} className="size-3.5" />
      {label}
    </button>
  );
}

/** The business and the number and dates, then Bill to and the engagement.
    The top row gives the business the room and the number only what it
    needs, where an invoice keeps it; the second divides in halves. Every
    cell is plain, and the box inside it bleeds alike. */
function Header({
  business,
  noSender,
  number,
  issued,
  due,
  client,
  preview,
  reference,
  edit,
}: {
  business: Business | undefined;
  noSender: boolean;
  number: string;
  issued: string;
  due: string;
  client: Pick<Client, 'name' | 'address' | 'email'> | undefined;
  preview: CardFigures | undefined;
  reference: string;
  edit: CardEdits | undefined;
}) {
  const period = edit?.period ?? preview;
  return (
    <>
      <div className="flex flex-wrap justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 flex-[1_1_200px]">
          <Sender
            business={business}
            noSender={noSender}
            onPress={edit?.onBusiness}
          />
        </div>
        <div className="flex-none">
          <Block onPress={edit?.onDates}>
            {/* Packed to the right, where an invoice keeps its number. */}
            <dl className="grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-1 type-support">
              <Figure label="No." value={number} mono />
              <Figure label="Issued" value={shortDate(issued)} />
              <Figure label="Due" value={shortDate(due)} />
            </dl>
          </Block>
        </div>
      </div>
      <div className="grid gap-x-8 gap-y-5 @min-[480px]/card:grid-cols-2">
        <div className="min-w-0">
          {client ? (
            <Block onPress={edit?.onClient}>
              <span className={`${LABEL} mb-2`}>Bill to</span>
              <Party
                name={client.name}
                lines={[client.address, client.email]}
              />
            </Block>
          ) : (
            <>
              {/* Where the client prints, marked as the first thing to choose. */}
              <span className={`${LABEL} mb-2`}>Bill to</span>
              <AddButton
                label="Choose a client"
                onClick={edit?.onClient}
                className="min-h-14"
              />
            </>
          )}
        </div>
        <div className="min-w-0">
          <span className={`${LABEL} mb-2`}>Engagement</span>
          <div className={STACK}>
            {/* The period prints here once, never under a line. */}
            <Block onPress={edit?.onPeriod}>
              <dl className="type-support">
                <Meta
                  label="Service period"
                  value={
                    period?.periodStart && period.periodEnd
                      ? `${shortDate(period.periodStart)} – ${shortDate(period.periodEnd)}`
                      : '—'
                  }
                />
              </dl>
            </Block>
            {edit ? (
              <dl className="type-support">
                <TypedReference reference={edit.reference} />
              </dl>
            ) : reference ? (
              <dl className="type-support">
                <Meta label="Reference" value={reference} />
              </dl>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Sender({
  business,
  noSender,
  onPress,
}: {
  business: Business | undefined;
  noSender: boolean;
  onPress: (() => void) | undefined;
}) {
  if (noSender && onPress)
    return (
      <AddButton
        label="Add your business"
        onClick={onPress}
        className="min-h-14"
      />
    );
  /* Where the sender prints, marked as missing rather than left blank. */
  if (noSender)
    return (
      <div
        aria-hidden
        className={`${dashedBleed()} min-h-14 rounded-md border border-dashed border-edge-control`}
      />
    );
  return (
    <Block onPress={onPress}>
      <Party
        name={business ? (business.name ?? 'Invoice') : ''}
        lines={[business?.address, business?.email]}
      />
    </Block>
  );
}

/** One of the number and dates: a label and its value, right-aligned, in
    the two columns their list lays out. */
function Figure({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-subtle">{label}</dt>
      <dd className={`text-right text-primary ${mono ? 'type-duration' : ''}`}>
        {value}
      </dd>
    </>
  );
}

/** Typed in place: a dashed underline once filled, a dashed add button
    while empty. */
const typedClass = (filled: boolean) =>
  filled
    ? `${bleed()} min-w-0 border-0 border-b border-dashed border-edge-control bg-transparent text-primary outline-none focus-visible:border-edge-focus`
    : `${DASHED} ${dashedBleed()} min-w-0 bg-transparent placeholder:text-muted outline-none focus-visible:placeholder:text-subtle`;

function TypedReference({ reference }: { reference: Typed }) {
  const filled = reference.value.trim() !== '';
  return (
    <div className="flex gap-3">
      {/* Kept in its slot when empty, so the field keeps focus as its label
          appears. */}
      {filled ? (
        <dt className="w-26 flex-none text-subtle">Reference</dt>
      ) : null}
      <dd className="min-w-0 flex-1">
        <input
          aria-label="Reference"
          value={reference.value}
          onChange={(e) => reference.onChange(e.target.value)}
          placeholder="Add a reference"
          maxLength={200}
          className={`type-support ${typedClass(filled)}`}
        />
      </dd>
    </div>
  );
}

function Notes({ notes }: { notes: string }) {
  return (
    <div className="border-t border-edge-subtle pt-4">
      <span className={`${LABEL} mb-2`}>Notes</span>
      <p className="whitespace-pre-line type-support text-muted">{notes}</p>
    </div>
  );
}

function TypedNotes({ notes }: { notes: Typed }) {
  const filled = notes.value.trim() !== '';
  return (
    <div className={filled ? 'border-t border-edge-subtle pt-4' : ''}>
      {filled ? <span className={`${LABEL} mb-2`}>Notes</span> : null}
      <textarea
        aria-label="Notes"
        rows={1}
        value={notes.value}
        onChange={(e) => notes.onChange(e.target.value)}
        placeholder="Add a note"
        maxLength={2000}
        className={`field-sizing-content resize-none type-support ${typedClass(filled)}`}
      />
    </div>
  );
}

function Party({
  name,
  lines,
}: {
  name: string;
  lines: Array<string | null | undefined>;
}) {
  return (
    <p className="min-w-0 flex-[1_1_200px] whitespace-pre-line type-support text-muted">
      <b className="block type-control text-strong">{name}</b>
      {lines.filter(Boolean).join('\n')}
    </p>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-26 flex-none text-subtle">{label}</dt>
      <dd className={`text-primary ${mono ? 'type-duration' : ''}`}>{value}</dd>
    </div>
  );
}

const TH = 'pb-2.5 type-label text-subtle';
const TD = 'type-duration py-2.5 pl-3 text-right align-top whitespace-nowrap';
/* The rate is the column a narrow card can spare: quantity × rate is still
   checkable from the amount, and the description keeps its room. */
const RATE = '@max-[360px]/card:hidden';
const ROW = 'border-b border-edge-subtle last:border-0';

function PaymentBlock({
  payment,
  edit,
}: {
  payment: PaymentDetails | null;
  edit: CardEdits | undefined;
}) {
  if (!edit) return payment ? <Payment payment={payment} /> : null;
  if (!payment)
    return (
      <div className="border-t border-edge-subtle pt-4">
        {edit.paymentMenu(<AddButton label="Add payment details" inline />)}
      </div>
    );
  return (
    <div className="border-t border-edge-subtle pt-4">
      {edit.paymentMenu(
        <button type="button" className={`${rowButton} ${bleed()} pr-7`}>
          <span className="sr-only">Edit</span>{' '}
          <PaymentFieldsBlock payment={payment} />
          <EditMark />
        </button>,
      )}
    </div>
  );
}

function Payment({ payment }: { payment: PaymentDetails }) {
  return (
    <div className="border-t border-edge-subtle pt-4">
      <PaymentFieldsBlock payment={payment} />
    </div>
  );
}

function PaymentFieldsBlock({ payment }: { payment: PaymentDetails }) {
  return (
    <div className="flex flex-col gap-3 type-support">
      <span className={LABEL}>Payment details</span>
      <PaymentFields fields={payment.fields} />
      {payment.intermediary.length > 0 ? (
        <PaymentFields fields={payment.intermediary} />
      ) : null}
      {payment.link ? (
        <p className="break-all text-primary">
          {payment.link.label}: {payment.link.url}
        </p>
      ) : null}
    </div>
  );
}

function PaymentFields({ fields }: { fields: PaymentDetails['fields'] }) {
  /* As many columns as spread the fields evenly over the fewest rows of at
     most four, so six print 3 + 3 and seven 4 + 3, never 5 + 1. Each column
     still needs 140px, so a narrow card gets fewer. */
  const cols = Math.ceil(fields.length / Math.ceil(fields.length / 4));
  const min = `calc((100% - ${cols - 1} * 1rem) / ${cols} - 1px)`;
  return (
    <dl
      className="grid gap-x-4 gap-y-3"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(max(140px, ${min}), 1fr))`,
      }}
    >
      {fields.map((f) => (
        <div key={f.label}>
          <dt className="text-subtle">{f.label}</dt>
          <dd className="text-primary">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type Line = NonNullable<CardFigures['lineItems']>[number];

/** An expense on the page: the server's line once it bills it, and the
    user's tick on New invoice. */
type ExpenseLine = {
  key: string;
  description: string;
  spentOn: string | null | undefined;
  amount: number;
  /** On New invoice: the expense, ticked or not. */
  expense?: Expense;
  billed: boolean;
};

/** The expense rows: the server's lines, or on New invoice each expense it
    can bill, unticked ones included so they can be ticked again, in the
    order they print. Only their amounts wait for the server. */
function expenseLines(lines: Line[], edit: CardEdits | undefined) {
  const served = lines.filter((li) => li.unit === 'expense');
  if (!edit)
    return served.map((li, i) => ({
      key: li.expenseId ?? `line-${i}`,
      description: li.description,
      spentOn: li.spentOn,
      amount: li.amount,
      billed: true,
    }));
  return edit.expenses.waiting.map((e): ExpenseLine => {
    const line = served.find((li) => li.expenseId === e.id);
    return {
      key: e.id,
      description: e.description,
      // A recurring one prints on the period's last day.
      spentOn: line?.spentOn ?? e.spentOn ?? edit.period.periodEnd,
      amount: line?.amount ?? e.amount,
      expense: e,
      billed: !edit.expenses.excluded.includes(e.id),
    };
  });
}

function Lines({
  preview,
  currency: cur,
  terms,
  updating,
  edit,
}: {
  /** Undefined on New invoice until the server first answers. */
  preview: CardFigures | undefined;
  currency: string;
  terms: string | null | undefined;
  updating: boolean;
  edit: CardEdits | undefined;
}) {
  const dim = updating ? DIM : '';
  const lineItems = preview?.lineItems ?? [];
  /* On New invoice the charges are the user's, listed as they are now;
     the server's copy of them lags a keystroke. */
  const services = lineItems.filter(
    (li) => li.unit !== 'expense' && !(edit && li.unit === 'fixed'),
  );
  const charges = edit?.charges.list ?? [];
  const expenses = expenseLines(lineItems, edit);
  /* Typed whatever the hours: the server refuses a summary invoice without
     its text. */
  const summaryOnly = edit?.summary !== undefined && services.length === 0;
  /* On New invoice, once the server has answered with no time, the table
     keeps its shape and says why its figures are blank. */
  const noTime =
    edit !== undefined && preview !== undefined && services.length === 0;
  const timeRows =
    summaryOnly || noTime || services.length > 0 || charges.length > 0;

  return (
    <>
      <table className="w-full type-support">
        <thead>
          <tr className="border-b border-edge-default text-left">
            <th scope="col" className={TH}>
              Description
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Qty
            </th>
            <th scope="col" className={`${TH} text-right ${RATE}`}>
              Rate
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Amount
            </th>
          </tr>
        </thead>
        {/* Never an empty body: one between the header and the expenses
              stops Chrome painting the rows' collapsed borders, and the
              header's underline with them. */}
        {timeRows ? (
          <tbody>
            {summaryOnly ? (
              <ServiceRow
                currency={cur}
                dim={dim}
                summary={edit?.summary}
                first
              />
            ) : noTime ? (
              <tr className={ROW}>
                <td colSpan={4} className="py-2.5 text-subtle">
                  No time in this period
                </td>
              </tr>
            ) : null}
            {services.map((li, i) => (
              <ServiceRow
                key={i}
                line={li}
                currency={cur}
                dim={dim}
                summary={edit?.summary}
                first={i === 0}
              />
            ))}
            {charges.map((c) => (
              <ChargeRow
                key={c.key}
                charge={c}
                currency={cur}
                onOpen={() => edit?.charges.onOpen(c.key)}
              />
            ))}
          </tbody>
        ) : null}
        {expenses.length > 0 ? (
          <tbody>
            <tr className="border-b border-edge-default text-left">
              <th scope="colgroup" colSpan={4} className={`${TH} pt-6`}>
                Expenses
              </th>
            </tr>
            {expenses.map((row) => (
              <ExpenseRowLine
                key={row.key}
                row={row}
                currency={cur}
                edit={edit}
              />
            ))}
          </tbody>
        ) : null}
      </table>

      {edit ? (
        <div className={ADD_ROW}>
          <AddButton label="Add a charge" onClick={edit.charges.onAdd} inline />
          <AddButton
            label="Add an expense"
            onClick={edit.expenses.onAdd}
            inline
          />
        </div>
      ) : null}

      {preview?.lineItems ? (
        <Dims updating={updating}>
          <Totals
            preview={preview}
            terms={terms}
            services={services.length + charges.length}
            expenses={expenses.some((e) => e.billed)}
          />
        </Dims>
      ) : null}
    </>
  );
}

const SHEET = 'rounded-lg border border-edge-subtle bg-surface-elevated p-6';

/** The id of New invoice's notice that the summary line is empty. */
export const SUMMARY_ERROR = 'inv-summary-error';

function ServiceRow({
  line,
  currency,
  dim,
  summary,
  first,
}: {
  /** Absent for the summary line before any hours: its figures are blank. */
  line?: Line;
  currency: string;
  /** The server's figures dim while it recomputes; typed text never does. */
  dim: string;
  summary: CardEdits['summary'];
  /** Each rate is a line of the same text, typed once on the first. */
  first: boolean;
}) {
  return (
    <tr className={ROW}>
      <td className="py-2.5 text-primary">
        {summary && !first ? (
          summary.value
        ) : summary ? (
          <input
            aria-label="Summary line"
            aria-invalid={summary.invalid || undefined}
            aria-describedby={summary.invalid ? SUMMARY_ERROR : undefined}
            value={summary.value}
            onChange={(e) => summary.onChange(e.target.value)}
            placeholder="Professional services"
            maxLength={200}
            className={`type-support ${typedClass(true)} aria-invalid:border-danger`}
          />
        ) : (
          line?.description
        )}
      </td>
      <td className={`${TD} text-muted ${dim}`}>
        {line ? formatQuantity(line.unit, line.quantity) : null}
      </td>
      <td className={`${TD} text-muted ${RATE} ${dim}`}>
        {line ? formatCurrency(line.unitPrice, currency) : null}
      </td>
      <td className={`${TD} text-strong ${dim}`}>
        {line ? formatCurrency(line.amount, currency) : null}
      </td>
    </tr>
  );
}

function ChargeRow({
  charge,
  currency,
  onOpen,
}: {
  charge: { description: string; amount: number };
  currency: string;
  onOpen: () => void;
}) {
  return (
    <tr className={ROW}>
      <td className="py-1">
        <button
          type="button"
          onClick={onOpen}
          className={`${rowButton} ${rowBleed} py-1.5 pr-7 text-primary`}
        >
          <span className="sr-only">Edit charge</span> {charge.description}
          <EditMark />
        </button>
      </td>
      <td className={`${TD} text-muted`}>{formatQuantity('fixed', 1)}</td>
      <td className={`${TD} text-muted ${RATE}`}>
        {formatCurrency(charge.amount, currency)}
      </td>
      <td className={`${TD} text-strong`}>
        {formatCurrency(charge.amount, currency)}
      </td>
    </tr>
  );
}

/** On New invoice an expense carries its tick, and an unticked one stays
    on the page, faint, so it can be ticked again. */
function ExpenseRowLine({
  row,
  currency,
  edit,
}: {
  row: ExpenseLine;
  currency: string;
  edit: CardEdits | undefined;
}) {
  const faint = row.billed ? '' : 'text-subtle line-through';
  const { expense } = row;
  return (
    <tr className={ROW}>
      <td className={`py-1 ${faint || 'text-primary'}`}>
        {edit && expense ? (
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={row.billed}
              onChange={(ev) =>
                edit.expenses.onToggle(row.key, ev.target.checked)
              }
              aria-label={`Bill ${row.description}`}
              className="size-4 flex-none accent-[var(--text-muted)]"
            />
            <button
              type="button"
              onClick={() => edit.expenses.onOpen(expense)}
              className={`${rowButton} -ml-0.5 min-w-0 flex-1 py-1.5 pr-7`}
            >
              <span className="sr-only">Edit</span> {row.description}
              <EditMark />
            </button>
          </span>
        ) : (
          <span className="block py-1.5">{row.description}</span>
        )}
      </td>
      <td className={`${TD} ${faint || 'text-muted'}`}>
        {shortDate(row.spentOn)}
      </td>
      <td className={RATE} />
      <td className={`${TD} ${faint || 'text-strong'}`}>
        {formatCurrency(row.amount, currency)}
      </td>
    </tr>
  );
}

function Totals({
  preview,
  terms,
  services,
  expenses,
}: {
  preview: CardFigures;
  terms: string | null | undefined;
  services: number;
  expenses: boolean;
}) {
  const cur = preview.currency;
  return (
    <>
      <dl className="ml-auto flex w-full max-w-64 flex-col gap-1.5 type-support">
        {/* An invoice of expenses alone has no services to subtotal. */}
        {services > 0 || !expenses ? (
          <Total
            label={expenses ? 'Services' : 'Subtotal'}
            value={formatCurrency(preview.subtotal, cur)}
          />
        ) : null}
        {preview.taxRate > 0 ? (
          <Total
            label={`Tax (${preview.taxRate}%)`}
            value={formatCurrency(preview.taxAmount, cur)}
          />
        ) : null}
        {expenses ? (
          <Total
            label="Expenses"
            value={formatCurrency(preview.expensesSubtotal, cur)}
          />
        ) : null}
        <Total
          label="Amount due"
          value={formatCurrency(preview.total, cur)}
          strong
        />
      </dl>
      {terms ? (
        <p className="-mt-3 ml-auto w-full max-w-64 type-support text-subtle">
          {terms}
        </p>
      ) : null}
    </>
  );
}

function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${
        strong
          ? 'mt-0.5 border-t border-edge-default pt-2 text-primary'
          : 'text-muted'
      }`}
    >
      <dt>{label}</dt>
      <dd className={strong ? 'type-amount text-strong' : 'type-duration'}>
        {value}
      </dd>
    </div>
  );
}

/** A schedule as a chip: pressed on, it is attached. */
function ScheduleChips({
  chosen,
  onChange,
}: {
  chosen: ScheduleKind[];
  onChange: (value: ScheduleKind[]) => void;
}) {
  return (
    <fieldset aria-label="Attach" className="flex flex-wrap gap-1.5">
      {SCHEDULE_KINDS.map((kind) => (
        <label
          key={kind}
          className={`${DASHED} cursor-pointer px-2.5 py-1 type-support has-checked:border-solid has-checked:border-edge-default has-checked:text-strong has-focus-visible:ring-2 has-focus-visible:ring-edge-focus`}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={chosen.includes(kind)}
            onChange={(e) =>
              onChange(
                SCHEDULE_KINDS.filter((k) =>
                  k === kind ? e.target.checked : chosen.includes(k),
                ),
              )
            }
          />
          {SCHEDULE_TITLES[kind]}
        </label>
      ))}
    </fieldset>
  );
}

/** What page 2 onward will hold: hours only, never money. On New invoice,
    with one summary line, its chips choose the tables. */
function Detail({
  detail,
  chosen,
  updating,
  onChange,
}: {
  detail: Schedules | null;
  chosen: ScheduleKind[];
  updating: boolean;
  onChange?: (value: ScheduleKind[]) => void;
}) {
  const shown = detail?.totalHours ? chosen : [];
  if (!onChange && shown.length === 0) return null;
  const kinds = SCHEDULE_KINDS.filter((k) => shown.includes(k));
  return (
    <div className="flex flex-col gap-5 border-t border-dashed border-edge-default pt-4">
      <span className="type-label text-subtle">Page 2 · supporting detail</span>
      {onChange ? <ScheduleChips chosen={chosen} onChange={onChange} /> : null}
      {detail
        ? kinds.map((kind) => (
            <Dims key={kind} updating={updating}>
              <ScheduleTable detail={detail} kind={kind} />
            </Dims>
          ))
        : null}
    </div>
  );
}

function ScheduleTable({
  detail,
  kind,
}: {
  detail: Schedules;
  kind: ScheduleKind;
}) {
  return (
    <div>
      <h3 className="mb-1 type-control text-strong">{SCHEDULE_TITLES[kind]}</h3>
      <table className="w-full type-support">
        <thead>
          <tr className="border-b border-edge-default text-left">
            {kind === 'date' ? (
              <th scope="col" className={TH}>
                Date
              </th>
            ) : null}
            <th scope="col" className={TH}>
              {kind === 'week' ? 'Week' : 'Project'}
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Hours
            </th>
          </tr>
        </thead>
        <tbody>
          {rows(detail, kind).map((cells, i) => (
            <tr key={i} className="border-b border-edge-subtle">
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className={
                    j === cells.length - 1
                      ? `${TD} text-muted`
                      : 'py-2.5 pr-3 text-primary'
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td
              colSpan={kind === 'date' ? 2 : 1}
              className="pt-2.5 type-control text-primary"
            >
              Total
            </td>
            <td className={`${TD} text-strong`}>
              {formatHours(detail.totalHours)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

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
