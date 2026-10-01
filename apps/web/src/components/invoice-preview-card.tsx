'use client';

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
import type { Client, InvoicePreview, Settings } from '@/lib/client/api';
import { shortDate } from './invoice-bits';

const LABEL = 'block type-label text-subtle';

/**
 * The invoice as its PDF will print it, live beside the form.
 *
 * The lines, totals and schedules are the server's answer; the rest — the
 * business block, the number, the dates, the payment block, which schedules
 * are ticked — is known here and shows in the same frame as the change that
 * set it. While the server recomputes, the figures dim and the caption says
 * so rather than showing a guess.
 */
export function InvoicePreviewCard({
  preview,
  client,
  settings,
  number,
  issued,
  due,
  reference,
  payment,
  schedules,
  updating,
  children,
}: {
  preview: InvoicePreview | undefined;
  client: Client | undefined;
  settings: Settings | undefined;
  /** A prediction: generation allocates the number. */
  number: string;
  issued: string;
  due: string;
  reference: string;
  payment: PaymentDetails | null;
  schedules: ScheduleKind[];
  updating: boolean;
  /** Warnings and errors, above the last line. */
  children?: React.ReactNode;
}) {
  const entries = preview?.entryCount ?? 0;

  return (
    <section aria-labelledby="inv-preview" className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pb-2.5">
        <h2 id="inv-preview" className="type-section text-strong">
          Preview
        </h2>
        {client ? (
          <span className="type-support text-subtle">
            {updating
              ? 'Updating…'
              : `${entries} entr${entries === 1 ? 'y' : 'ies'}`}
          </span>
        ) : null}
      </div>

      {/* The scroller is around the card, not in it: the card moves as one
          page, edges and all, while the caption above keeps "Updating…" in
          view. */}
      <div className="min-h-0 overflow-y-auto">
        <div className="@container/card flex flex-col gap-5 rounded-lg border border-edge-subtle bg-surface-elevated p-6">
          {client ? (
            <div
              className={`flex flex-col gap-5 transition-opacity duration-150 ${
                updating ? 'opacity-50' : ''
              }`}
            >
              <div className="flex flex-wrap justify-between gap-x-8 gap-y-4">
                <Party
                  name={settings?.businessName ?? ''}
                  lines={[settings?.businessAddress, settings?.businessEmail]}
                />
                <dl className="flex flex-col gap-1 type-support">
                  <Meta label="No." value={number} mono right />
                  <Meta label="Issued" value={shortDate(issued)} right />
                  <Meta label="Due" value={shortDate(due)} right />
                </dl>
              </div>

              <div className="flex flex-wrap justify-between gap-x-8 gap-y-4">
                <div className="min-w-0 flex-[1_1_200px]">
                  <span className={`${LABEL} mb-2`}>Bill to</span>
                  <Party
                    name={client.name}
                    lines={[client.address, client.email]}
                  />
                </div>
                <div className="min-w-0 flex-[1_1_200px]">
                  <span className={`${LABEL} mb-2`}>Engagement</span>
                  <dl className="flex flex-col gap-1 type-support">
                    {/* The period prints here once, never under a line. */}
                    <Meta
                      label="Service period"
                      value={
                        preview
                          ? `${shortDate(preview.periodStart)} – ${shortDate(preview.periodEnd)}`
                          : '—'
                      }
                    />
                    {reference ? (
                      <Meta label="Reference" value={reference} />
                    ) : null}
                  </dl>
                </div>
              </div>

              {preview ? <Lines preview={preview} /> : null}

              {payment ? (
                <div className="border-t border-edge-subtle pt-4">
                  <span className={`${LABEL} mb-2`}>Payment details</span>
                  <dl className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-3 type-support">
                    {payment.fields.map((f) => (
                      <div key={f.label}>
                        <dt className="text-subtle">{f.label}</dt>
                        <dd className="text-primary">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {preview?.schedules && schedules.length > 0 ? (
                <Detail detail={preview.schedules} chosen={schedules} />
              ) : null}
            </div>
          ) : (
            <p className="type-support text-subtle">
              Choose a client to see what this invoice will say.
            </p>
          )}

          {children}

          <p className="border-t border-edge-subtle pt-3 type-support text-subtle">
            Generating assigns a number and locks these entries. Voiding later
            keeps the number on record.
          </p>
        </div>
      </div>
    </section>
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
  right,
}: {
  label: string;
  value: string;
  mono?: boolean;
  right?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${right ? 'justify-end' : ''}`}>
      <dt className={`flex-none text-subtle ${right ? '' : 'w-26'}`}>
        {label}
      </dt>
      <dd
        className={`text-primary ${right ? 'min-w-24 text-right' : ''} ${
          mono ? 'type-duration' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

const TH = 'pb-2.5 type-label text-subtle';
const TD = 'type-duration py-2.5 pl-3 text-right align-top whitespace-nowrap';
/* The rate is the column a narrow card can spare: quantity × rate is still
   checkable from the amount, and the description keeps its room. */
const RATE = '@max-[360px]/card:hidden';

function Lines({ preview }: { preview: InvoicePreview }) {
  const cur = preview.currency;
  const services = preview.lineItems.filter((li) => li.unit !== 'expense');
  const expenses = preview.lineItems.filter((li) => li.unit === 'expense');

  if (preview.lineItems.length === 0) {
    return (
      <p className="type-support text-subtle">
        Nothing to bill: no billable, un-invoiced time in this period, and no
        expenses or charges. Running timers and non-billable entries never reach
        an invoice.
      </p>
    );
  }

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
        <tbody>
          {services.map((li, i) => (
            <tr key={i} className="border-b border-edge-subtle last:border-0">
              <td className="py-2.5 text-primary">{li.description}</td>
              <td className={`${TD} text-muted`}>
                {formatQuantity(li.unit, li.quantity)}
              </td>
              <td className={`${TD} text-muted ${RATE}`}>
                {formatCurrency(li.unitPrice, cur)}
              </td>
              <td className={`${TD} text-strong`}>
                {formatCurrency(li.amount, cur)}
              </td>
            </tr>
          ))}
        </tbody>
        {expenses.length > 0 ? (
          <tbody>
            <tr className="border-b border-edge-default text-left">
              <th scope="colgroup" colSpan={4} className={`${TH} pt-6`}>
                Expenses
              </th>
            </tr>
            {expenses.map((li, i) => (
              <tr key={i} className="border-b border-edge-subtle last:border-0">
                <td className="py-2.5 text-primary">{li.description}</td>
                <td className={`${TD} text-muted`}>{shortDate(li.spentOn)}</td>
                <td className={RATE} />
                <td className={`${TD} text-strong`}>
                  {formatCurrency(li.amount, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>

      <dl className="ml-auto flex w-full max-w-64 flex-col gap-1.5 type-support">
        {/* An invoice of expenses alone has no services to subtotal. */}
        {services.length > 0 || expenses.length === 0 ? (
          <Total
            label={expenses.length > 0 ? 'Services' : 'Subtotal'}
            value={formatCurrency(preview.subtotal, cur)}
          />
        ) : null}
        {preview.taxRate > 0 ? (
          <Total
            label={`Tax (${preview.taxRate}%)`}
            value={formatCurrency(preview.taxAmount, cur)}
          />
        ) : null}
        {expenses.length > 0 ? (
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

/** What page 2 onward will hold: hours only, never money. */
function Detail({
  detail,
  chosen,
}: {
  detail: Schedules;
  chosen: ScheduleKind[];
}) {
  const kinds = SCHEDULE_KINDS.filter((k) => chosen.includes(k));
  return (
    <div className="flex flex-col gap-5 border-t border-dashed border-edge-default pt-4">
      <span className="type-label text-subtle">Page 2 · supporting detail</span>
      {kinds.map((kind) => (
        <div key={kind}>
          <h3 className="mb-1 type-control text-strong">
            {SCHEDULE_TITLES[kind]}
          </h3>
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
      ))}
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
