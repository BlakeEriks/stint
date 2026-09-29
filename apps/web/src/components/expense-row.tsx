'use client';

import Link from 'next/link';
import { ArrowRight, Pencil, Repeat } from 'lucide-react';
import { formatCurrency } from '@stint/core';
import type { Expense } from '@/lib/client/api';

/** "Aug 20": the year is the invoice's business, not the row's. */
function monthDay(date: string) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d));
}

/** Billed and past editing: on an invoice that is no longer a draft. */
export function isLocked(expense: Expense) {
  return expense.invoiceStatus !== null && expense.invoiceStatus !== 'draft';
}

const rowClass =
  'group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2 text-left ' +
  'hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-edge-focus focus-visible:outline-none';

/**
 * One expense on one line, name first: the label, the date and the amount
 * follow in columns, so a card of them scans like a ledger.
 *
 * A recurring expense has no date and says so with its label. One on an
 * invoice is labeled with the invoice's number and steps down a shade, since
 * it is already asked for; it links to that invoice instead of opening the
 * dialog, because an issued one is locked.
 *
 * `leading` (New invoice's checkbox) makes it a plain row: the checkbox is
 * the control, and the pencil would be a second one.
 */
export function ExpenseRow({
  expense,
  currency,
  onOpen,
  leading,
}: {
  expense: Expense;
  currency?: string;
  onOpen?: () => void;
  leading?: React.ReactNode;
}) {
  const billed = expense.invoiceId !== null;
  const cells = (
    <>
      {leading}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`truncate type-control ${billed ? 'text-muted' : 'text-strong'}`}
        >
          {expense.description}
        </span>
        {expense.recurring ? (
          <span className="flex flex-none items-center gap-1 type-badge text-subtle">
            <Repeat aria-hidden strokeWidth={1.75} className="size-3" />
            Recurring
          </span>
        ) : expense.invoiceNumber ? (
          <span className="flex-none type-badge text-subtle">
            {expense.invoiceNumber}
          </span>
        ) : null}
      </span>
      <span className="w-14 flex-none text-right type-meta text-subtle">
        {expense.spentOn ? monthDay(expense.spentOn) : ''}
      </span>
      <span
        className={`w-24 flex-none text-right type-duration ${billed ? 'text-muted' : 'text-strong'}`}
      >
        {formatCurrency(expense.amount, currency)}
      </span>
    </>
  );

  if (leading) {
    return <div className="flex items-center gap-3 py-2">{cells}</div>;
  }

  if (billed) {
    return (
      <Link
        href={`/invoices/${expense.invoiceId}`}
        aria-label={`${expense.description}, on ${expense.invoiceNumber}`}
        className={rowClass}
      >
        {cells}
        <ArrowRight
          aria-hidden
          strokeWidth={1.75}
          className="size-3.5 flex-none text-subtle group-hover:text-strong"
        />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Edit ${expense.description}`}
      className={rowClass}
    >
      {cells}
      <Pencil
        aria-hidden
        strokeWidth={1.75}
        className="size-3.5 flex-none text-subtle group-hover:text-strong"
      />
    </button>
  );
}
