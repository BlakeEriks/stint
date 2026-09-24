'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  formatCompact,
  formatCurrency,
  type ImportPreview,
  type ImportResult,
  type ImportRow,
} from '@stint/core';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { inputClass, Section } from './field';
import { DetailPage } from './page';
import { api } from '@/lib/client/api';
import { invalidateEntryData, keys } from '@/lib/client/query-keys';
import { timeZone } from '@/lib/client/use-timer';

const TH = 'pb-2 pr-3 type-label text-subtle';

const were = (n: number) => (n === 1 ? 'was' : 'were');

const RATE_SOURCE = {
  entry: 'entry',
  project: 'project rate',
  client: 'client rate',
  default: 'your default',
  none: '',
} as const;

const when = (zone: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  });

interface Upload {
  file: File;
  zone: string;
  allBillable: boolean;
  invoicedThrough: string;
}

function form({ file, zone, allBillable, invoicedThrough }: Upload) {
  const f = new FormData();
  f.set('file', file);
  f.set('timeZone', zone);
  f.set('allBillable', String(allBillable));
  f.set('invoicedThrough', invoicedThrough);
  return f;
}

/**
 * Bring history in from Toggl: choose the export, read what it
 * will write, confirm. Nothing is written until the confirm.
 */
export function ImportPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  /* The export's times are wall clock in the zone of the account that
     exported them, which is not always where this browser is today. */
  const [zone, setZone] = useState(timeZone);
  /* Filled after mount: the server's zone list and zone differ from the
     browser's, so rendering them there fails hydration. */
  const [zones, setZones] = useState<string[]>([]);
  const [allBillable, setAllBillable] = useState(false);
  const [invoicedThrough, setInvoicedThrough] = useState('');
  useEffect(() => {
    setZones(Intl.supportedValuesOf('timeZone'));
    setZone(timeZone);
  }, []);

  const preview = useMutation({
    mutationFn: (u: Upload) => api.importPreview(form(u)),
  });
  const confirm = useMutation({
    mutationFn: (u: Upload) => api.importConfirm(form(u)),
    onSuccess: () => {
      invalidateEntryData(queryClient);
      queryClient.invalidateQueries({ queryKey: keys.projects() });
      queryClient.invalidateQueries({ queryKey: keys.clients() });
    },
  });

  const upload = { zone, allBillable, invoicedThrough };
  const choose = (f: File | null, next: Partial<typeof upload> = {}) => {
    const u = { ...upload, ...next };
    setFile(f);
    setZone(u.zone);
    setAllBillable(u.allBillable);
    setInvoicedThrough(u.invoicedThrough);
    confirm.reset();
    if (f) preview.mutate({ file: f, ...u });
    else preview.reset();
  };

  return (
    <DetailPage back="/settings" label="Settings" wide>
      <h1 className="mb-6 type-title text-strong">Import</h1>
      <div>
        <Section
          title="From Toggl"
          description="Export a detailed report from Toggl Track as CSV and choose the file. You see every entry before anything is written, and importing the same file again adds nothing."
        >
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            aria-label="Export file"
            className="type-control text-muted file:mr-3 file:rounded-md file:border file:border-edge-default file:bg-surface-elevated file:px-3 file:py-1.5 file:text-strong"
            onChange={(e) =>
              choose(e.target.files?.[0] ?? null, { allBillable: false })
            }
          />
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-subtle">
              Times in the export are in
            </span>
            <select
              className={`${inputClass} max-w-xs`}
              value={zone}
              onChange={(e) => choose(file, { zone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-subtle">
              Already invoiced through
            </span>
            <input
              type="date"
              className={`${inputClass} max-w-xs`}
              value={invoicedThrough}
              onChange={(e) =>
                choose(file, { invoicedThrough: e.target.value })
              }
            />
            <span className="type-meta text-subtle">
              Work up to this date was billed from Toggl or elsewhere. It still
              counts as earned, never as unbilled. Leave empty if none was.
            </span>
          </label>
          {preview.isPending ? (
            <p className="type-support text-subtle">Reading the file…</p>
          ) : null}
          {preview.error ? (
            <p role="alert" className="type-support text-muted">
              {preview.error.message} Nothing was imported.
            </p>
          ) : null}
        </Section>

        {confirm.data && preview.data ? (
          <Result result={confirm.data} preview={preview.data} />
        ) : preview.data && file ? (
          <Review
            preview={preview.data}
            zone={zone}
            allBillable={allBillable}
            onAllBillable={(b) => choose(file, { allBillable: b })}
            onConfirm={() => confirm.mutate({ file, ...upload })}
            pending={confirm.isPending}
          />
        ) : null}

        {confirm.error ? (
          <p role="alert" className="type-support text-muted">
            {confirm.error.message} Trying again is safe — nothing is imported
            twice.
          </p>
        ) : null}
      </div>
    </DetailPage>
  );
}

function Review({
  preview,
  zone,
  allBillable,
  onAllBillable,
  onConfirm,
  pending,
}: {
  preview: ImportPreview;
  zone: string;
  allBillable: boolean;
  onAllBillable: (b: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { summary } = preview;
  const fmt = when(zone);
  const creating = [
    ...preview.newClients.map((c) => `client ${c.name}`),
    ...preview.newProjects.map((p) => `project ${p.name}`),
  ];

  return (
    <Section
      title={
        summary.newCount
          ? `${summary.newCount} new ${summary.newCount === 1 ? 'entry' : 'entries'} from Toggl`
          : 'Nothing new in this file'
      }
      description={[
        summary.alreadyImportedCount
          ? `${summary.alreadyImportedCount} ${were(summary.alreadyImportedCount)} imported before and will be left as ${summary.alreadyImportedCount === 1 ? 'it is' : 'they are'}.`
          : null,
        summary.unratedCount
          ? `${summary.unratedCount} will be unrated until a rate is set on their project, client or account.`
          : null,
        summary.invoicedElsewhereCount
          ? `${summary.invoicedElsewhereCount} ${were(summary.invoicedElsewhereCount)} already invoiced elsewhere.`
          : null,
        summary.overlappingCount
          ? `${summary.overlappingCount} overlap other work by a minute or more; they import as they are and wait in the inbox.`
          : null,
        summary.excludedCount
          ? `${summary.excludedCount} will not be imported — see below.`
          : null,
        creating.length ? `Creates ${creating.join(', ')}.` : null,
      ]
        .filter(Boolean)
        .join(' ')}
      status={
        <Button
          type="button"
          variant="accent"
          onClick={onConfirm}
          disabled={pending || summary.newCount === 0}
        >
          {pending ? 'Importing…' : summary.newCount ? 'Import' : 'Nothing new'}
        </Button>
      }
    >
      {summary.exportedNoneBillable ? (
        <label className="flex items-start gap-2 type-support text-primary">
          <input
            type="checkbox"
            className="mt-1"
            checked={allBillable}
            onChange={(e) => onAllBillable(e.target.checked)}
          />
          <span>
            Import them as billable
            <span className="block type-meta text-subtle">
              Toggl marked every entry not billable. Its free plan does that to
              all of them, whatever the work was.
            </span>
          </span>
        </label>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full type-support">
          <thead>
            <tr className="border-b border-edge-subtle text-left">
              <th scope="col" className={TH}>
                Start
              </th>
              <th scope="col" className={TH}>
                Task
              </th>
              <th scope="col" className={TH}>
                Project
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Time
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Rate
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <Row key={row.id} row={row} fmt={fmt} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Row({ row, fmt }: { row: ImportRow; fmt: Intl.DateTimeFormat }) {
  const seconds = row.endedAt
    ? (Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000
    : null;
  const muted = row.willWrite && !row.alreadyImported ? '' : ' opacity-60';

  return (
    <tr className={`border-b border-edge-subtle last:border-0${muted}`}>
      <td className="py-2 pr-3 whitespace-nowrap text-muted">
        {fmt.format(new Date(row.startedAt))}
      </td>
      <td className="py-2 pr-3 text-primary">
        {row.taskName || <span className="text-subtle">No description</span>}
        {row.alreadyImported ? (
          <span className="mt-0.5 block type-meta text-subtle">
            Already imported
          </span>
        ) : null}
        {row.invoicedElsewhere ? (
          <span className="mt-0.5 block type-meta text-subtle">
            Invoiced elsewhere
          </span>
        ) : null}
        {row.overlapsWith.length ? (
          <span className="mt-0.5 block type-meta text-primary">
            Overlaps {row.overlapsWith.length}{' '}
            {row.overlapsWith.length === 1 ? 'entry' : 'entries'} — imported,
            and listed in the inbox to fix
          </span>
        ) : null}
        {row.durationDisagreement && row.reportedSeconds != null ? (
          <span className="mt-0.5 block type-meta text-primary">
            Toggl's own total says {formatCompact(row.reportedSeconds)}; the
            start and end are what import
          </span>
        ) : null}
        {row.excludedReason ? (
          <span className="mt-0.5 block type-meta text-subtle">
            {row.excludedReason === 'no_end_time'
              ? 'Not imported: the export has no end time.'
              : 'Not imported: it ends before it starts.'}
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-muted">
        {row.projectName ?? <span className="text-subtle">No project</span>}
        {row.clientName ? (
          <span className="block type-meta text-subtle">{row.clientName}</span>
        ) : null}
      </td>
      <td className="type-duration py-2 pr-3 text-right text-muted">
        {seconds == null ? '—' : formatCompact(seconds)}
      </td>
      <td className="type-duration py-2 text-right text-muted">
        {!row.willWrite ? (
          '—'
        ) : !row.billable ? (
          <span className="text-subtle">Not billable</span>
        ) : row.resolvedRate == null ? (
          <span className="text-danger">No rate</span>
        ) : (
          <>
            {`${formatCurrency(row.resolvedRate)}/h`}
            <span className="block type-meta text-subtle">
              {RATE_SOURCE[row.rateSource]}
            </span>
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * What the import did, in place of the preview. An imported history has no
 * rate until one is set, and invoicing refuses unrated work, so that is the
 * first thing offered.
 */
function Result({
  result,
  preview,
}: {
  result: ImportResult;
  preview: ImportPreview;
}) {
  const clientIds = [
    ...new Set(
      preview.rows.flatMap((r) =>
        r.willWrite && r.clientId ? [r.clientId] : [],
      ),
    ),
  ];
  const rateHref =
    clientIds.length === 1 ? `/clients/${clientIds[0]}` : '/settings';
  const names = [
    ...new Set(
      preview.rows.flatMap((r) =>
        r.willWrite && r.clientName ? [r.clientName] : [],
      ),
    ),
  ];

  return (
    <Section
      title={`Imported ${result.written} ${result.written === 1 ? 'entry' : 'entries'}`}
      description={[
        names.length ? `Into ${names.join(', ')}.` : null,
        result.alreadyImported
          ? `${result.alreadyImported} ${were(result.alreadyImported)} already here and left as ${result.alreadyImported === 1 ? 'it was' : 'they were'}.`
          : null,
        result.invoicedElsewhere
          ? `${result.invoicedElsewhere} ${were(result.invoicedElsewhere)} marked invoiced elsewhere.`
          : null,
        result.excluded
          ? `${result.excluded} had no end time and ${result.excluded === 1 ? 'was' : 'were'} not imported.`
          : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {result.unrated ? (
        <p className="type-support text-danger">
          {result.unrated} {result.unrated === 1 ? 'entry has' : 'entries have'}{' '}
          no rate yet — invoicing will refuse them until one is set.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {result.unrated ? (
          <Button asChild>
            <Link href={rateHref}>Set a rate</Link>
          </Button>
        ) : null}
        <Button asChild variant={result.unrated ? 'ghost' : 'default'}>
          <Link href="/calendar">Open the calendar</Link>
        </Button>
      </div>
    </Section>
  );
}
