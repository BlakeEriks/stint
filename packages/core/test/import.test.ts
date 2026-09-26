import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deterministicUuidv7 } from '../src/uuid.ts';
import { parseCsv } from '../src/import/csv.ts';
import {
  buildPreview,
  parseExport,
  type ImportContext,
} from '../src/import/index.ts';

const USER = '11111111-1111-1111-1111-111111111111';

const TOGGL = `﻿User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (USD)
Me,me@x,Acme,Site,,"Design, round 2",Yes,2026-03-10,09:00:00,2026-03-10,10:30:00,01:30:00,,150.00
Me,me@x,,Internal,,Admin,No,2026-03-10,11:00:00,2026-03-10,11:15:00,00:15:00,a,
Me,me@x,Acme,Site,,"Design, round 2",Yes,2026-03-10,09:00:00,2026-03-10,10:30:00,01:30:00,,150.00
Me,me@x,Acme,Site,,Open,Yes,2026-03-11,09:00:00,,,,,
`;

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  userId: USER,
  allBillable: false,
  choices: {},
  excluded: [],
  existing: [],
  timeZone: 'America/New_York',
  defaultRate: 100,
  clients: [
    { id: 'c1', name: 'ACME ', hourlyRate: null, color: null, archived: false },
  ],
  projects: [
    {
      id: 'p1',
      name: 'site',
      clientId: 'c1',
      hourlyRate: 0,
      isBillableDefault: true,
      archived: false,
    },
  ],
  ...over,
});

async function preview(over?: Partial<ImportContext>) {
  const parsed = parseExport(TOGGL);
  assert.ok(parsed.ok);
  return buildPreview(parsed.source, parsed.rows, ctx(over));
}

test('deterministicUuidv7 is stable per key, distinct across keys, and v7', async () => {
  const a = await deterministicUuidv7('k', 1_700_000_000_000);
  assert.equal(a, await deterministicUuidv7('k', 1_700_000_000_000));
  assert.notEqual(a, await deterministicUuidv7('k2', 1_700_000_000_000));
  assert.match(
    a,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('parseCsv handles quoted commas, newlines and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,"b, c","d\r\ne","f ""g"""\r\n1,2,3,4\n'), [
    ['a', 'b, c', 'd\r\ne', 'f "g"'],
    ['1', '2', '3', '4'],
  ]);
});

test('an unrecognized file is refused with a reason', () => {
  const r = parseExport('name,amount\nfoo,1\n');
  assert.equal(r.ok, false);
});

test('an unreadable row refuses the whole file, naming the line', () => {
  const bad = TOGGL.replace('2026-03-11', 'someday');
  const r = parseExport(bad);
  assert.ok(!r.ok && r.reason.includes('Line 5'));
});

test('Toggl rows land on the right instants, in the account zone', async () => {
  const p = await preview();
  assert.equal(p.source, 'toggl');
  assert.equal(p.rows[0]?.startedAt, '2026-03-10T13:00:00.000Z');
  assert.equal(p.rows[0]?.endedAt, '2026-03-10T14:30:00.000Z');
  assert.equal(p.rows[0]?.taskName, 'Design, round 2');
});

test('the repeated hour of a fall-back resolves to its first occurrence', async () => {
  const csv =
    TOGGL.split('\n')[0] +
    '\nMe,me@x,,X,,T,Yes,2026-11-01,01:30:00,2026-11-01,01:45:00,00:15:00,,\n';
  const parsed = parseExport(csv);
  assert.ok(parsed.ok);
  const p = await buildPreview(parsed.source, parsed.rows, ctx());
  assert.equal(p.rows[0]?.startedAt, '2026-11-01T05:30:00.000Z');
});

test('the same file yields the same ids; identical twins get distinct ids', async () => {
  const [a, b] = [await preview(), await preview()];
  assert.deepEqual(
    a.rows.map((r) => r.id),
    b.rows.map((r) => r.id),
  );
  assert.notEqual(a.rows[0]?.id, a.rows[2]?.id);
});

test('ids differ per user, so two accounts never collide', async () => {
  const other = await preview({
    userId: '22222222-2222-2222-2222-222222222222',
  });
  assert.notEqual((await preview()).rows[0]?.id, other.rows[0]?.id);
});

test('a rate is never taken from the export amount, and 0 is a real rate', async () => {
  const row = (await preview()).rows[0];
  assert.equal(row?.projectId, 'p1', 'matched case- and space-insensitively');
  assert.equal(row?.reportedAmount, 150);
  assert.equal(row?.resolvedRate, 0);
  assert.equal(row?.rateSource, 'project');
});

test('with nothing in the chain an entry is unrated, not guessed', async () => {
  const p = await preview({ defaultRate: null, projects: [] });
  const site = p.rows[0];
  assert.equal(site?.resolvedRate, null);
  assert.equal(site?.rateSource, 'none');
  // Non-billable "Admin" is not counted as unrated.
  assert.equal(p.summary.unratedCount, 2);
});

test('unknown projects and clients are created once, by name', async () => {
  const p = await preview({ clients: [], projects: [] });
  assert.deepEqual(
    p.clients.filter((c) => c.isNew).map((c) => c.name),
    ['Acme'],
  );
  assert.deepEqual(p.newProjects.map((x) => x.name).sort(), [
    'Internal',
    'Site',
  ]);
  assert.equal(p.rows[0]?.projectId, p.rows[2]?.projectId);
  assert.equal(p.rows[1]?.billable, false, 'the export says No');
});

test('a row with no end is excluded, never given one', async () => {
  const p = await preview();
  const open = p.rows[3];
  assert.equal(open?.willWrite, false);
  assert.equal(open?.excludedReason, 'no_end_time');
  assert.equal(open?.endedAt, null);
  assert.equal(p.summary.excludedCount, 1);
  assert.equal(p.summary.willWriteCount, 3);
});

test('a tab-separated export reads the same as a comma one', () => {
  const tsv = parseCsv('a\tb, c\t"d\te"\n1\t2\t3\n');
  assert.deepEqual(tsv, [
    ['a', 'b, c', 'd\te'],
    ['1', '2', '3'],
  ]);
});

test('an export with every row not billable is named, and can be overridden', async () => {
  const csv = TOGGL.replaceAll(',Yes,', ',No,');
  const parsed = parseExport(csv);
  assert.ok(parsed.ok);
  const as = await buildPreview(parsed.source, parsed.rows, ctx());
  assert.equal(as.summary.exportedNoneBillable, true);
  assert.ok(as.rows.every((r) => !r.billable));
  const over = await buildPreview(
    parsed.source,
    parsed.rows,
    ctx({ allBillable: true }),
  );
  assert.ok(over.rows.every((r) => r.billable));
  assert.equal((await preview()).summary.exportedNoneBillable, false);
});

test("entries on or before their client's invoiced-through date are marked invoiced elsewhere", async () => {
  const p = await preview({
    choices: { acme: { invoicedThrough: '2026-03-10' } },
  });
  // Admin has no client, so no date reaches it.
  assert.deepEqual(
    p.rows.map((r) => r.invoicedElsewhere),
    [true, false, true, false],
  );
  assert.equal(p.summary.invoicedElsewhereCount, 2);
  assert.ok((await preview()).rows.every((r) => !r.invoicedElsewhere));
});

test('overlaps within the file and against existing work are listed, never dropped', async () => {
  // Admin (11:00–11:15 ET) sits inside this existing entry; the twin Design
  // rows overlap each other for their full 90 minutes.
  const p = await preview({
    existing: [
      {
        id: 'e1',
        taskName: 'Call',
        startedAt: '2026-03-10T15:05:00.000Z',
        endedAt: '2026-03-10T15:10:00.000Z',
      },
    ],
  });
  const [, admin] = p.rows;
  assert.deepEqual(
    p.overlaps.map((o) => [o.taskName, o.otherInStint, o.seconds]),
    [
      ['Design, round 2', false, 5400],
      ['Admin', true, 300],
    ],
  );
  assert.equal(p.overlaps[1]?.rowId, admin?.id);
  assert.equal(p.overlaps[1]?.otherTaskName, 'Call');
  assert.equal(p.summary.overlappingCount, 2);
  assert.ok(p.rows.slice(0, 3).every((r) => r.willWrite));
});

test('a row already imported is not an overlap with its own copy', async () => {
  const first = await preview();
  const again = await preview({
    existing: first.rows
      .filter((r) => r.willWrite)
      .map((r) => ({
        id: r.id,
        taskName: r.taskName,
        startedAt: r.startedAt,
        endedAt: r.endedAt as string,
      })),
  });
  assert.equal(first.overlaps.length, 1);
  assert.equal(again.overlaps.length, 0, 'both copies are already in Stint');
});

test("a real Toggl detailed export's shape: tabs, Currency and Amount apart, free plan", async () => {
  const text = readFileSync(
    new URL('./fixtures/toggl-detailed.tsv', import.meta.url),
    'utf8',
  );
  const parsed = parseExport(text);
  assert.ok(parsed.ok);
  const p = await buildPreview(
    parsed.source,
    parsed.rows,
    ctx({ clients: [], projects: [] }),
  );
  assert.equal(p.summary.willWriteCount, 6);
  assert.equal(p.summary.exportedNoneBillable, true);
  assert.deepEqual(
    p.clients.map((c) => c.name),
    ['Northwind'],
  );
  assert.equal(
    p.rows[5]?.taskName,
    'E4.2 — extract & codify the visual language',
  );
  assert.equal(p.rows[0]?.reportedAmount, 0);
  // Foundation runs past Standup's start by three minutes: listed. The two
  // Standups share eight seconds: not.
  assert.deepEqual(
    p.overlaps.map((o) => [o.rowId, o.otherTaskName]),
    [[p.rows[3]?.id, 'Foundation + security POC with Sam + Val']],
  );
});

test('a re-upload previews as nothing new, before anything is confirmed', async () => {
  const first = await preview();
  assert.equal(first.summary.newCount, 3);
  const again = await preview({
    existing: first.rows
      .filter((r) => r.willWrite)
      .map((r) => ({
        id: r.id,
        taskName: r.taskName,
        startedAt: r.startedAt,
        endedAt: r.endedAt as string,
      })),
  });
  assert.equal(again.summary.newCount, 0);
  assert.equal(again.summary.alreadyImportedCount, 3);
  assert.ok(
    again.rows.filter((r) => r.willWrite).every((r) => r.alreadyImported),
  );
});

// ── choices made on the review ─────────────────────────────────────

const HEADER =
  'User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (USD)';

/** One Acme row a day on Mar 10, from `HH:MM` to `HH:MM`, in New York. */
async function rows(
  spans: [string, string, string][],
  over?: Partial<ImportContext>,
) {
  const parsed = parseExport(
    [
      HEADER,
      ...spans.map(
        ([task, from, to]) =>
          `Me,me@x,Acme,Site,,${task},Yes,2026-03-10,${from}:00,2026-03-10,${to}:00,,,`,
      ),
    ].join('\n'),
  );
  assert.ok(parsed.ok);
  return buildPreview(parsed.source, parsed.rows, ctx(over));
}

test('an exclusion keeps a listed overlap out, and is ignored for a row that overlaps nothing', async () => {
  const first = await preview();
  const listed = first.overlaps[0];
  const admin = first.rows[1];
  assert.ok(listed && admin);

  const p = await preview({
    excluded: [listed.sourceRowId, admin.sourceRowId],
  });
  assert.equal(p.overlaps[0]?.excluded, true);
  assert.equal(p.summary.overlappingCount, 0);
  const out = p.rows.find((r) => r.id === listed.rowId);
  assert.equal(out?.excluded, true);
  assert.equal(out?.willWrite, false);
  assert.equal(p.rows[1]?.excluded, false, 'Admin overlaps nothing');
  assert.equal(p.rows[1]?.willWrite, true);
  assert.equal(p.summary.newCount, first.summary.newCount - 1);
});

test('the listed row is the one from the file, even when the Stint entry starts later', async () => {
  const p = await rows([['Build', '09:00', '11:00']], {
    existing: [
      {
        id: 'e1',
        taskName: 'Call',
        startedAt: '2026-03-10T14:30:00.000Z', // 10:30 ET
        endedAt: '2026-03-10T16:00:00.000Z',
      },
    ],
  });
  assert.deepEqual(
    p.overlaps.map((o) => [
      o.taskName,
      o.otherTaskName,
      o.otherInStint,
      o.seconds,
    ]),
    [['Build', 'Call', true, 1800]],
  );
});

test('excluding a row settles every overlap it caused', async () => {
  // A overlaps Stint's entry and B; B overlaps only A.
  const existing = [
    {
      id: 'e1',
      taskName: 'Call',
      startedAt: '2026-03-10T12:00:00.000Z', // 08:00–09:30 ET
      endedAt: '2026-03-10T13:30:00.000Z',
    },
  ];
  const first = await rows(
    [
      ['A', '09:00', '11:00'],
      ['B', '10:00', '12:00'],
    ],
    { existing },
  );
  assert.deepEqual(
    first.overlaps.map((o) => o.taskName),
    ['B', 'A'],
  );
  const a = first.rows[0]?.sourceRowId as string;
  const b = first.rows[1]?.sourceRowId as string;

  const settled = await rows(
    [
      ['A', '09:00', '11:00'],
      ['B', '10:00', '12:00'],
    ],
    { existing, excluded: [a] },
  );
  assert.deepEqual(
    settled.overlaps.map((o) => [o.taskName, o.excluded]),
    [['A', true]],
    'B no longer overlaps anything that imports',
  );

  const both = await rows(
    [
      ['A', '09:00', '11:00'],
      ['B', '10:00', '12:00'],
    ],
    { existing, excluded: [a, b] },
  );
  assert.deepEqual(
    both.overlaps.map((o) => [o.taskName, o.excluded]),
    [
      ['B', true],
      ['A', true],
    ],
    'an excluded row stays listed, so it can be undone',
  );
});

test("a new client's rate and color come from the choices; an existing client's never do", async () => {
  const created = await preview({
    clients: [],
    projects: [],
    choices: { acme: { hourlyRate: 0, color: '#DA8188' } },
  });
  assert.deepEqual(
    created.clients.map((c) => [c.name, c.isNew, c.hourlyRate, c.color]),
    [['Acme', true, 0, '#DA8188']],
  );
  assert.equal(created.rows[0]?.resolvedRate, 0, '0 is a real rate');
  assert.equal(created.rows[0]?.rateSource, 'client');

  const kept = await preview({
    projects: [],
    choices: { acme: { hourlyRate: 999, color: '#DA8188' } },
  });
  assert.deepEqual(
    kept.clients.map((c) => [c.isNew, c.hourlyRate, c.color]),
    [[false, null, null]],
  );
  assert.equal(kept.rows[0]?.resolvedRate, 100, 'the default, not 999');
});

test('the summary spans the new rows, and each client carries its hours', async () => {
  const p = await preview();
  assert.equal(p.summary.firstStartedAt, '2026-03-10T13:00:00.000Z');
  assert.equal(p.summary.lastEndedAt, '2026-03-10T15:15:00.000Z');
  assert.deepEqual(
    p.clients.map((c) => [c.name, c.seconds]),
    [['ACME ', 10800]],
  );
  assert.equal(p.defaultRate, 100);
});
