'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  formatCompact,
  formatCurrency,
  type ImportPreview,
  type ImportRow,
} from '@stint/core';
import { Button } from '@/components/ui/button';
import { inputClass, Section } from './field';
import { Page } from './page';
import { api } from '@/lib/client/api';
import { invalidateEntryData, keys } from '@/lib/client/query-keys';
import { timeZone } from '@/lib/client/use-timer';

const TH = 'pb-2 pr-3 type-label text-subtle';

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
}

function form({ file, zone }: Upload) {
  const f = new FormData();
  f.set('file', file);
  f.set('timeZone', zone);
  return f;
}

/**
 * Bring history in from Toggl or Harvest: choose the export, read what it
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

  const choose = (f: File | null, z: string) => {
    setFile(f);
    setZone(z);
    confirm.reset();
    if (f) preview.mutate({ file: f, zone: z });
    else preview.reset();
  };

  return (
    <Page wide>
      <h1 className="mb-6 type-title text-strong">Import</h1>
      <div className="flex flex-col gap-4">
        <Section
          title="From Toggl or Harvest"
          description="Export your time entries as CSV and choose the file. You see every entry before anything is written, and importing the same file again adds nothing."
        >
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Export file"
            className="type-control text-muted file:mr-3 file:rounded-md file:border file:border-edge-default file:bg-surface-elevated file:px-3 file:py-1.5 file:text-strong"
            onChange={(e) => choose(e.target.files?.[0] ?? null, zone)}
          />
          <label className="flex flex-col gap-1.5">
            <span className="type-label text-subtle">
              Times in the export are in
            </span>
            <select
              className={`${inputClass} max-w-xs`}
              value={zone}
              onChange={(e) => choose(file, e.target.value)}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
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

        {preview.data && file ? (
          <Review
            preview={preview.data}
            zone={zone}
            onConfirm={() => confirm.mutate({ file, zone })}
            pending={confirm.isPending}
            done={confirm.isSuccess}
          />
        ) : null}

        {confirm.error ? (
          <p role="alert" className="type-support text-muted">
            {confirm.error.message} Trying again is safe — nothing is imported
            twice.
          </p>
        ) : null}

        {confirm.data ? (
          <p role="status" className="type-support text-primary">
            Imported {confirm.data.written}{' '}
            {confirm.data.written === 1 ? 'entry' : 'entries'}
            {confirm.data.alreadyImported
              ? `; ${confirm.data.alreadyImported} were already here`
              : ''}
            .
          </p>
        ) : null}
      </div>
    </Page>
  );
}

function Review({
  preview,
  zone,
  onConfirm,
  pending,
  done,
}: {
  preview: ImportPreview;
  zone: string;
  onConfirm: () => void;
  pending: boolean;
  done: boolean;
}) {
  const { summary } = preview;
  const fmt = when(zone);
  const creating = [
    ...preview.newClients.map((c) => `client ${c.name}`),
    ...preview.newProjects.map((p) => `project ${p.name}`),
  ];

  return (
    <Section
      title={`${summary.willWriteCount} ${
        summary.willWriteCount === 1 ? 'entry' : 'entries'
      } from ${preview.source === 'toggl' ? 'Toggl' : 'Harvest'}`}
      description={[
        summary.unratedCount
          ? `${summary.unratedCount} will be unrated until a rate is set on their project, client or account.`
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
          disabled={pending || done || summary.willWriteCount === 0}
        >
          {pending ? 'Importing…' : 'Import'}
        </Button>
      }
    >
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
  const muted = row.willWrite ? '' : ' opacity-60';

  return (
    <tr className={`border-b border-edge-subtle last:border-0${muted}`}>
      <td className="py-2 pr-3 whitespace-nowrap text-muted">
        {fmt.format(new Date(row.startedAt))}
      </td>
      <td className="py-2 pr-3 text-primary">
        {row.taskName || <span className="text-subtle">No description</span>}
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
          `${formatCurrency(row.resolvedRate)}/h`
        )}
      </td>
    </tr>
  );
}
