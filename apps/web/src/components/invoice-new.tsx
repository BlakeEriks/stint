'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Section, inputClass, textareaClass } from './field';
import { formatCurrency, formatHours } from '@stint/core';
import { timeZone as tz } from '@/lib/client/use-timer';
import {
  api,
  ApiError,
  type GroupingMode,
  type InvoicePreview,
} from '@/lib/client/api';
import { DetailPage } from './page';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

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

interface Draft {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  groupingMode: GroupingMode;
  notes: string;
  dueDate: string;
}

/** Computed on mount, not at import: the default period is "last month". */
const empty = (): Draft => ({
  clientId: '',
  periodStart: defaultStart(),
  periodEnd: defaultEnd(),
  groupingMode: 'entry',
  notes: '',
  dueDate: '',
});

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

  const [draft, setDraft] = useState<Draft>(empty);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);

  const { data: clientData } = useQuery({
    queryKey: keys.clients(),
    queryFn: () => api.clients(),
  });
  const clients = clientData?.clients ?? [];

  const runPreview = useMutation({
    mutationFn: () =>
      api.previewInvoice({
        clientId: draft.clientId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        groupingMode: draft.groupingMode,
        tz,
      }),
    onSuccess: setPreview,
  });

  const generate = useMutation({
    mutationFn: () =>
      api.createInvoice({
        clientId: draft.clientId,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        groupingMode: draft.groupingMode,
        tz,
        notes: draft.notes.trim() || undefined,
        dueDate: draft.dueDate || undefined,
      }),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: keys.invoices() });
      // Generation marks the entries invoiced, so they leave every unbilled view.
      invalidateEntryData(queryClient);
      router.push(`/invoices/${invoice.id}`);
    },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* Any change to WHAT WOULD BE BILLED invalidates the approved preview.
     The due date and the notes do not: they decorate the document rather
     than decide its lines. */
  const setBilled = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    set(key, value);
    setPreview(null);
  };

  const blocked = (preview?.unratedEntryIds.length ?? 0) > 0;
  const nothingToBill = preview !== null && preview.lineItems.length === 0;

  return (
    <DetailPage back="/invoices" label="Invoices">
      <h1 className="mb-6 type-title text-strong">New invoice</h1>

      <div className="flex flex-col gap-4">
        <Section title="What to bill">
          <Field label="Client" htmlFor="inv-client" required>
            <select
              id="inv-client"
              value={draft.clientId}
              onChange={(e) => setBilled('clientId', e.target.value)}
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
                value={draft.periodStart}
                onChange={(e) => setBilled('periodStart', e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="inv-to" className="flex-1 basis-40">
              <Input
                id="inv-to"
                type="date"
                value={draft.periodEnd}
                onChange={(e) => setBilled('periodEnd', e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Group lines"
            htmlFor="inv-group"
            hint={GROUPINGS.find((g) => g.value === draft.groupingMode)?.hint}
          >
            <select
              id="inv-group"
              value={draft.groupingMode}
              onChange={(e) =>
                setBilled('groupingMode', e.target.value as GroupingMode)
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
              disabled={!draft.clientId || runPreview.isPending}
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
                  value={draft.dueDate}
                  onChange={(e) => set('dueDate', e.target.value)}
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
                  value={draft.notes}
                  onChange={(e) => set('notes', e.target.value)}
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
                disabled={generate.isPending || blocked || nothingToBill}
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
    </DetailPage>
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
                <Td>{formatHours(item.quantityHours)}</Td>
                <Td>{formatCurrency(item.resolvedRate, preview.currency)}</Td>
                <Td strong>{formatCurrency(item.amount, preview.currency)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="ml-auto flex w-full max-w-[16rem] flex-col gap-1 type-support">
        <Total
          label="Subtotal"
          value={formatCurrency(preview.subtotal, preview.currency)}
        />
        {preview.taxRate > 0 ? (
          <Total
            label={`Tax (${preview.taxRate}%)`}
            value={formatCurrency(preview.taxAmount, preview.currency)}
          />
        ) : null}
        <Total
          label="Total"
          value={formatCurrency(preview.total, preview.currency)}
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
