'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Section, inputClass, textareaClass } from './field';
import { money } from './invoice-bits';
import { useTimeZone } from '@/lib/client/use-timer';
import {
  api,
  ApiError,
  type GroupingMode,
  type InvoicePreview,
} from '@/lib/client/api';

const GROUPINGS: { value: GroupingMode; label: string; hint: string }[] = [
  { value: 'entry', label: 'Every entry', hint: 'One line per time entry.' },
  {
    value: 'task',
    label: 'By task name',
    hint: 'Entries with the same name and rate are summed.',
  },
  { value: 'project', label: 'By project', hint: 'One line per project.' },
  { value: 'day', label: 'By day', hint: 'One line per day worked.' },
];

/**
 * Preview, then generate.
 *
 * The preview has no side effects; generating allocates a gapless number,
 * freezes the rates and locks the entries. That asymmetry is the whole
 * reason this is two steps — the irreversible half must never be a surprise.
 */
export function NewInvoice() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tz = useTimeZone();

  const [clientId, setClientId] = useState('');
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(defaultEnd);
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('entry');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [preview, setPreview] = useState<InvoicePreview | null>(null);

  const { data: clientData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients(),
  });
  const clients = clientData?.clients ?? [];

  const runPreview = useMutation({
    mutationFn: () =>
      api.previewInvoice({
        clientId,
        periodStart,
        periodEnd,
        groupingMode,
        tz,
      }),
    onSuccess: setPreview,
  });

  const generate = useMutation({
    mutationFn: () =>
      api.createInvoice({
        clientId,
        periodStart,
        periodEnd,
        groupingMode,
        tz,
        notes: notes.trim() || undefined,
        dueDate: dueDate || undefined,
      }),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push(`/invoices/${invoice.id}`);
    },
  });

  // Any change to what would be billed invalidates the approved preview.
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview(null);
    };

  const blocked = (preview?.unratedEntryIds.length ?? 0) > 0;
  const empty = preview !== null && preview.lineItems.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/invoices"
        className="type-label text-subtle hover:text-muted"
      >
        ← Invoices
      </Link>
      <h1 className="mt-4 mb-6 type-title text-strong">New invoice</h1>

      <div className="flex flex-col gap-4">
        <Section title="What to bill">
          <Field label="Client" htmlFor="inv-client" required>
            <select
              id="inv-client"
              value={clientId}
              onChange={(e) => reset(setClientId)(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-wrap gap-4">
            <Field label="From" htmlFor="inv-from" className="flex-1 basis-40">
              <Input
                id="inv-from"
                type="date"
                value={periodStart}
                onChange={(e) => reset(setPeriodStart)(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="inv-to" className="flex-1 basis-40">
              <Input
                id="inv-to"
                type="date"
                value={periodEnd}
                onChange={(e) => reset(setPeriodEnd)(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Group lines"
            htmlFor="inv-group"
            hint={GROUPINGS.find((g) => g.value === groupingMode)?.hint}
          >
            <select
              id="inv-group"
              value={groupingMode}
              onChange={(e) =>
                reset(setGroupingMode)(e.target.value as GroupingMode)
              }
              className={inputClass}
            >
              {GROUPINGS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => runPreview.mutate()}
              disabled={!clientId || runPreview.isPending}
            >
              {runPreview.isPending ? 'Checking…' : 'Preview'}
            </Button>
          </div>

          {runPreview.error ? (
            <p role="alert" className="type-support text-danger">
              {runPreview.error instanceof ApiError
                ? runPreview.error.message
                : 'Could not build a preview.'}
            </p>
          ) : null}
        </Section>

        {preview ? (
          <>
            <PreviewTable preview={preview} />

            <Section title="Invoice details">
              <Field
                label="Due date"
                htmlFor="inv-due"
                hint="Defaults to your payment terms."
              >
                <Input
                  id="inv-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>

              <Field
                label="Notes"
                htmlFor="inv-notes"
                hint="Printed on the invoice."
              >
                <textarea
                  id="inv-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={textareaClass}
                />
              </Field>
            </Section>

            {blocked ? (
              <p role="alert" className="type-support text-warning">
                {preview.unratedEntryIds.length} entr
                {preview.unratedEntryIds.length === 1 ? 'y has' : 'ies have'} no
                rate. Set a rate on the client, the project, or your defaults
                before generating.
              </p>
            ) : null}

            {generate.error ? (
              <p role="alert" className="type-support text-danger">
                {generate.error instanceof ApiError
                  ? generate.error.message
                  : 'Could not generate this invoice.'}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => generate.mutate()}
                disabled={generate.isPending || blocked || empty}
              >
                {generate.isPending ? 'Generating…' : 'Generate invoice'}
              </Button>
              <p className="type-support text-subtle">
                Assigns a number and locks these entries. Voiding later keeps
                the number on record.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function PreviewTable({ preview }: { preview: InvoicePreview }) {
  if (preview.lineItems.length === 0) {
    return (
      <Section title="Nothing to bill">
        <p className="type-support text-subtle">
          No billable, un-invoiced time in this period. Running timers and
          non-billable entries never reach an invoice.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title={`${preview.clientName} · ${preview.entryCount} entr${
        preview.entryCount === 1 ? 'y' : 'ies'
      }`}
      description="Nothing has been created yet."
    >
      <div className="overflow-x-auto">
        <table className="w-full type-support">
          <thead>
            <tr className="border-b border-edge-subtle text-left">
              <Th>Description</Th>
              <Th align="right">Hours</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {preview.lineItems.map((item, i) => (
              <tr key={i} className="border-b border-edge-subtle last:border-0">
                <td className="py-2 pr-3 text-primary">{item.description}</td>
                <Td>{item.quantityHours.toFixed(2)}</Td>
                <Td>{money(item.resolvedRate, preview.currency)}</Td>
                <Td strong>{money(item.amount, preview.currency)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto flex w-full max-w-[16rem] flex-col gap-1 type-support">
        <Total
          label="Subtotal"
          value={money(preview.subtotal, preview.currency)}
        />
        {preview.taxRate > 0 ? (
          <Total
            label={`Tax (${preview.taxRate}%)`}
            value={money(preview.taxAmount, preview.currency)}
          />
        ) : null}
        <Total
          label="Total"
          value={money(preview.total, preview.currency)}
          strong
        />
      </dl>
    </Section>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}) {
  return (
    <th
      scope="col"
      className={`pb-2 type-label text-subtle ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`type-duration py-2 pl-3 text-right ${
        strong ? 'text-strong' : 'text-muted'
      }`}
    >
      {children}
    </td>
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
        strong ? 'border-t border-edge-subtle pt-1.5' : ''
      }`}
    >
      <dt className={strong ? 'text-primary' : 'text-muted'}>{label}</dt>
      <dd
        className={`${strong ? 'type-amount text-strong' : 'type-duration text-muted'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Default to last month, the period a contractor most often bills. */
function defaultStart() {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
function defaultEnd() {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 0));
}
function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
