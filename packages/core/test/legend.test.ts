import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legendClients } from '../src/legend.ts';

/* Two projects under one client, a client with no color, and a project with
   no client. */
const clientByProject = new Map([
  ['p-north-a', { id: 'c-north', name: 'Northwind', color: '#6EA1E2' }],
  ['p-north-b', { id: 'c-north', name: 'Northwind', color: '#6EA1E2' }],
  ['p-byrne', { id: 'c-byrne', name: 'Byrne', color: '#42B59A' }],
  ['p-plain', { id: 'c-plain', name: 'Plain', color: null }],
]);

const e = (projectId: string | null, durationSeconds: number | null) => ({
  projectId,
  durationSeconds,
});

const cases: Array<{
  name: string;
  entries: ReturnType<typeof e>[];
  clients: string[];
  noClient: boolean;
}> = [
  { name: 'nothing logged', entries: [], clients: [], noClient: false },
  {
    name: 'one row per client, not per project',
    entries: [e('p-north-a', 3600), e('p-north-b', 3600)],
    clients: ['Northwind'],
    noClient: false,
  },
  {
    name: 'ranked by tracked time, not arrival order',
    entries: [e('p-byrne', 3600), e('p-north-a', 14400)],
    clients: ['Northwind', 'Byrne'],
    noClient: false,
  },
  {
    name: 'work with no project is "No client"',
    entries: [e(null, 3600)],
    clients: [],
    noClient: true,
  },
  {
    name: 'a project with no client is "No client"',
    entries: [e('p-unknown', 3600)],
    clients: [],
    noClient: true,
  },
  {
    // #156: a colorless client was filed under "No client".
    name: 'a client with no color is still named',
    entries: [e('p-plain', 3600)],
    clients: ['Plain'],
    noClient: false,
  },
  {
    name: 'a running entry names its client with no time yet',
    entries: [e('p-byrne', null)],
    clients: ['Byrne'],
    noClient: false,
  },
  {
    name: 'running internal work adds no "No client" until it has time',
    entries: [e(null, null)],
    clients: [],
    noClient: false,
  },
];

for (const c of cases) {
  test(`legendClients: ${c.name}`, () => {
    const out = legendClients(c.entries, clientByProject);
    assert.deepEqual(
      out.clients.map((x) => x.name),
      c.clients,
    );
    assert.equal(out.noClient, c.noClient);
  });
}

test('legendClients carries the client color, null included', () => {
  const out = legendClients(
    [e('p-north-a', 60), e('p-plain', 30)],
    clientByProject,
  );
  assert.deepEqual(out.clients, [
    { id: 'c-north', name: 'Northwind', color: '#6EA1E2', seconds: 60 },
    { id: 'c-plain', name: 'Plain', color: null, seconds: 30 },
  ]);
});
