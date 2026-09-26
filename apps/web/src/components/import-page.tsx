'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ClientChoice,
  formatCompact,
  formatCurrency,
  type ImportClient,
  type ImportOverlap,
  type ImportPreview,
  type ImportResult,
} from '@stint/core';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColorPicker } from './color-picker';
import { inputClass, Section } from './field';
import { DetailPage } from './page';
import { Swatch } from './swatch';
import { api } from '@/lib/client/api';
import { invalidateEntryData, keys } from '@/lib/client/query-keys';
import { timeZone } from '@/lib/client/use-timer';

const were = (n: number) => (n === 1 ? 'was' : 'were');
const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Overlaps shown before "Show more": the bulk action is the answer to more. */
const FIRST_OVERLAPS = 5;

const when = (zone: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zone,
  });

const day = (zone: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: zone,
  });

type Choices = Record<string, ClientChoice>;

interface Upload {
  file: File;
  zone: string;
  allBillable: boolean;
  clients: Choices;
  excluded: string[];
}

function form({ file, zone, allBillable, clients, excluded }: Upload) {
  const f = new FormData();
  f.set('file', file);
  f.set('timeZone', zone);
  f.set('allBillable', String(allBillable));
  f.set('clients', JSON.stringify(clients));
  f.set('excluded', JSON.stringify(excluded));
  return f;
}

/**
 * Bring history in from Toggl: choose the export, read what it will add,
 * settle what needs settling, confirm. Nothing is written until the confirm.
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
  const [clients, setClients] = useState<Choices>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  useEffect(() => {
    setZones(Intl.supportedValuesOf('timeZone'));
    setZone(timeZone);
  }, []);

  /* The last preview stays on screen while a choice re-reads the file, so a
     click does not blank the page; a slower, older read never replaces a
     newer one. */
  const [shown, setShown] = useState<ImportPreview | null>(null);
  const latest = useRef(0);
  const preview = useMutation({
    mutationFn: async (u: Upload) => {
      const n = ++latest.current;
      return { n, preview: await api.importPreview(form(u)) };
    },
    onSuccess: ({ n, preview }) => {
      if (n === latest.current) setShown(preview);
    },
  });
  const confirm = useMutation({
    mutationFn: (u: Upload) => api.importConfirm(form(u)),
    onSuccess: () => {
      invalidateEntryData(queryClient);
      queryClient.invalidateQueries({ queryKey: keys.projects() });
      queryClient.invalidateQueries({ queryKey: keys.clients() });
    },
  });

  const upload = { zone, allBillable, clients, excluded };
  const choose = (f: File | null, next: Partial<typeof upload> = {}) => {
    const u = { ...upload, ...next };
    if (f !== file) setShown(null);
    setFile(f);
    setZone(u.zone);
    setAllBillable(u.allBillable);
    setClients(u.clients);
    setExcluded(u.excluded);
    confirm.reset();
    if (f) preview.mutate({ file: f, ...u });
    else preview.reset();
  };

  /* Color moves no number, so it is held here and sent with the confirm
     rather than re-reading the file. */
  const chooseClient = (key: string, c: ClientChoice) => {
    const next = { ...clients, [key]: { ...clients[key], ...c } };
    if ('color' in c && Object.keys(c).length === 1) setClients(next);
    else choose(file, { clients: next });
  };

  return (
    <DetailPage back="/settings" label="Settings">
      <h1 className="mb-6 type-title text-strong">Import</h1>
      <div>
        <Section
          title="From Toggl"
          description="Export a detailed report from Toggl Track as CSV and choose the file. Nothing is written until you confirm, and importing the same file again adds nothing."
        >
          <input
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            aria-label="Export file"
            className="type-control text-muted file:mr-3 file:rounded-md file:border file:border-edge-default file:bg-surface-elevated file:px-3 file:py-1.5 file:text-strong"
            onChange={(e) =>
              choose(e.target.files?.[0] ?? null, {
                allBillable: false,
                clients: {},
                excluded: [],
              })
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
          {preview.isPending && !shown ? (
            <p className="type-support text-subtle">Reading the file…</p>
          ) : null}
          {preview.error ? (
            <p role="alert" className="type-support text-muted">
              {preview.error.message} Nothing was imported.
            </p>
          ) : null}
        </Section>

        {confirm.data && shown ? (
          <Result result={confirm.data} preview={shown} />
        ) : shown && file ? (
          <Review
            preview={shown}
            zone={zone}
            allBillable={allBillable}
            onAllBillable={(b) => choose(file, { allBillable: b })}
            choices={clients}
            onChoose={chooseClient}
            onExclude={(ids, out) =>
              choose(file, {
                excluded: out
                  ? [...new Set([...excluded, ...ids])]
                  : excluded.filter((x) => !ids.includes(x)),
              })
            }
            onConfirm={() => confirm.mutate({ file, ...upload })}
            /* A failed re-read leaves the last preview on screen, and the
               choices it did not reflect would still be sent: confirm only
               what was read. */
            disabled={confirm.isPending || preview.isPending || preview.isError}
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
  choices,
  onChoose,
  onExclude,
  onConfirm,
  disabled,
}: {
  preview: ImportPreview;
  zone: string;
  allBillable: boolean;
  onAllBillable: (b: boolean) => void;
  choices: Choices;
  onChoose: (key: string, c: ClientChoice) => void;
  onExclude: (sourceRowIds: string[], out: boolean) => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const { summary } = preview;
  const fmt = when(zone);
  const newClients = preview.clients.filter((c) => c.isNew).length;

  return (
    <>
      <Section
        title={
          summary.newCount
            ? `${plural(summary.newCount, 'new entry', 'new entries')} from Toggl`
            : 'Nothing new in this file'
        }
        description={
          summary.firstStartedAt && summary.lastEndedAt
            ? `${fmt.format(new Date(summary.firstStartedAt))} – ${fmt.format(new Date(summary.lastEndedAt))}`
            : undefined
        }
      >
        <p className="-mt-3 type-support text-muted">
          {[
            newClients ? plural(newClients, 'new client', 'new clients') : null,
            preview.newProjects.length
              ? plural(
                  preview.newProjects.length,
                  'new project',
                  'new projects',
                )
              : null,
            summary.alreadyImportedCount
              ? `${summary.alreadyImportedCount.toLocaleString('en-US')} already here`
              : null,
            summary.excludedCount
              ? `${plural(summary.excludedCount, 'row has', 'rows have')} no usable end time and won't import`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
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
                Toggl marked every entry not billable. Its free plan does that
                to all of them, whatever the work was.
              </span>
            </span>
          </label>
        ) : null}
      </Section>

      {preview.clients.length ? (
        <Section
          title="Clients in this file"
          description="Work up to a client's date was billed from Toggl or elsewhere: still earned, never unbilled. Leave it empty if none was. A new client's empty rate uses your default."
        >
          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_8rem_10rem] gap-4 pb-1">
              <span />
              <span className="text-right type-label text-subtle">Rate</span>
              <span className="type-label text-subtle">Invoiced through</span>
            </div>
            <ul>
              {preview.clients.map((c) => (
                <ClientRow
                  key={c.id}
                  client={c}
                  choice={choices[c.key] ?? {}}
                  defaultRate={preview.defaultRate}
                  onChoose={(choice) => onChoose(c.key, choice)}
                />
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      {preview.overlaps.length ? (
        <Overlaps
          overlaps={preview.overlaps}
          day={day(zone)}
          onExclude={onExclude}
        />
      ) : null}

      <div className="flex justify-end border-t border-edge-subtle pt-[18px]">
        <Button
          type="button"
          variant="accent"
          onClick={onConfirm}
          disabled={disabled || summary.newCount === 0}
        >
          {summary.newCount
            ? `Import ${plural(summary.newCount, 'entry', 'entries')}`
            : 'Nothing new'}
        </Button>
      </div>
    </>
  );
}

function ClientRow({
  client,
  choice,
  defaultRate,
  onChoose,
}: {
  client: ImportClient;
  choice: ClientChoice;
  defaultRate: number | null;
  onChoose: (c: ClientChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = client.isNew ? (choice.color ?? null) : client.color;
  const rate = choice.hourlyRate ?? null;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_8rem_10rem] items-center gap-4 border-t border-edge-subtle py-2.5 first:border-0">
      <div className="flex min-w-0 items-start gap-2.5">
        {client.isNew ? (
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger
              aria-label={`${client.name} color`}
              className="mt-1 flex-none rounded-[2px] outline-none focus-visible:ring-[3px] focus-visible:ring-edge-focus"
            >
              {/* Unchosen reads as an outline: the gray fill would say
                  "internal work", which a client is not. */}
              {color ? (
                <Swatch
                  color={color}
                  size="size-3.5"
                  style={{ display: 'block' }}
                />
              ) : (
                <span
                  aria-hidden
                  className="block size-3.5 rounded-[2px] border-[1.5px] border-edge-default"
                />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-2">
              <ColorPicker
                label={`${client.name} color`}
                value={color}
                onChange={(c) => {
                  onChoose({ color: c });
                  setOpen(false);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Swatch color={color} size="size-3.5" style={{ marginTop: 4 }} />
        )}
        <div className="min-w-0">
          <p className="truncate type-body text-primary">{client.name}</p>
          <p className="type-meta text-subtle">
            {client.isNew ? 'new client · ' : ''}
            {formatCompact(client.seconds)}
          </p>
        </div>
      </div>

      {client.isNew ? (
        <label className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 type-control text-subtle">
            $
          </span>
          <input
            /* Uncontrolled, committed on blur: every commit re-reads the
               file, and a read per keystroke is a read per digit. */
            key={rate ?? ''}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            aria-label={`${client.name} rate`}
            defaultValue={rate ?? ''}
            placeholder={
              defaultRate == null ? 'rate' : `${defaultRate} default`
            }
            aria-invalid={
              rate == null && defaultRate == null ? true : undefined
            }
            className={`${inputClass} pl-6 type-duration aria-invalid:border-danger`}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const n = v === '' ? null : Number(v);
              if (n !== null && !(n >= 0)) return;
              if (n !== rate) onChoose({ hourlyRate: n });
            }}
          />
        </label>
      ) : (
        <span className="text-right type-duration text-muted">
          {client.hourlyRate != null ? (
            `${formatCurrency(client.hourlyRate)}/h`
          ) : defaultRate != null ? (
            <>
              {`${formatCurrency(defaultRate)}/h`}
              <span className="block type-meta text-subtle">your default</span>
            </>
          ) : (
            <span className="text-danger">No rate</span>
          )}
        </span>
      )}

      <input
        type="date"
        aria-label={`${client.name} invoiced through`}
        className={inputClass}
        value={choice.invoicedThrough ?? ''}
        onChange={(e) => onChoose({ invoicedThrough: e.target.value || null })}
      />
    </li>
  );
}

/**
 * Every overlap past the grace period, longest first. Exclude keeps the
 * listed row out; what it overlaps stands, and nothing in Stint is touched.
 */
function Overlaps({
  overlaps,
  day,
  onExclude,
}: {
  overlaps: ImportOverlap[];
  day: Intl.DateTimeFormat;
  onExclude: (sourceRowIds: string[], out: boolean) => void;
}) {
  const [all, setAll] = useState(false);
  const open = overlaps.filter((o) => !o.excluded);
  const shown = all ? overlaps : overlaps.slice(0, FIRST_OVERLAPS);

  return (
    <Section
      title={`${plural(overlaps.length, 'entry overlaps', 'entries overlap')} other work`}
      description="Longest first. Exclude one and it stays out of the import; what it overlaps stands."
      status={
        open.length > 1 ? (
          <Button
            type="button"
            size="xs"
            onClick={() =>
              onExclude(
                open.map((o) => o.sourceRowId),
                true,
              )
            }
          >
            Exclude all {open.length.toLocaleString('en-US')}
          </Button>
        ) : null
      }
    >
      <div>
        <ul>
          {shown.map((o) => (
            <li
              key={o.rowId}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-t border-edge-subtle py-2.5 first:border-0"
            >
              <div className={`min-w-0${o.excluded ? ' opacity-60' : ''}`}>
                <p className="truncate type-body text-primary">
                  {o.taskName || 'No description'}
                </p>
                <p className="truncate type-meta text-subtle">
                  {day.format(new Date(o.startedAt))} ·{' '}
                  {o.excluded
                    ? "won't import"
                    : `overlaps ${o.otherTaskName || 'an entry'} · ${o.otherInStint ? 'in Stint' : 'in this file'}`}
                </p>
              </div>
              <span
                className={`type-duration text-warning${o.excluded ? ' opacity-60' : ''}`}
              >
                {formatCompact(o.seconds)}
              </span>
              <Button
                type="button"
                size="xs"
                variant={o.excluded ? 'ghost' : 'default'}
                aria-label={`${o.excluded ? 'Undo excluding' : 'Exclude'} ${o.taskName || 'this entry'}`}
                onClick={() => onExclude([o.sourceRowId], !o.excluded)}
              >
                {o.excluded ? 'Undo' : 'Exclude'}
              </Button>
            </li>
          ))}
        </ul>
        {overlaps.length > shown.length ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="mt-2"
            onClick={() => setAll(true)}
          >
            Show {(overlaps.length - shown.length).toLocaleString('en-US')} more
          </Button>
        ) : null}
      </div>
    </Section>
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
