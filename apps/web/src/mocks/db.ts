import { localDateKey, localDateTimeToInstant } from '@stint/core';
import { type Db, entry, id, ids, seed, settings } from './fixtures';
import { ZONE } from './time.mts';

/**
 * The account a story starts from. A name for the common ones, or a function
 * that edits the seeded account for anything else.
 */
export type Scenario =
  | 'seeded'
  | 'running'
  | 'runningUnrated'
  | 'empty'
  | ((db: Db) => void);

const scenarios: Record<
  Exclude<Scenario, (db: Db) => void>,
  (db: Db) => void
> = {
  seeded: () => {},
  // A timer started after lunch.
  running: (db) => {
    db.entries.push(running(db, '13:45', ids.rush, 'Checkout timeout fix'));
  },
  // A timer on work nothing prices: no project, and no default rate.
  runningUnrated: (db) => {
    db.settings.defaultHourlyRate = null;
    db.entries.push(running(db, '13:45', null, 'Reading the RFC'));
  },
  // A new account: settings and nothing else.
  empty: (db) => {
    Object.assign(db, {
      settings: { ...settings(), nextInvoiceNumber: 1 },
      clients: [],
      projects: [],
      entries: [],
      invoices: [],
      expenses: [],
      paymentProfiles: [],
    });
  },
};

export function running(
  db: Db,
  time: string,
  projectId: string | null,
  taskName: string,
) {
  const today = localDateKey(db.now, ZONE);
  return entry(9000, today, time, 0, projectId, taskName, {
    id: id(9000),
    startedAt: localDateTimeToInstant(today, time, ZONE).toISOString(),
    endedAt: null,
    durationSeconds: null,
  });
}

let db: Db | undefined;

/** Called before every story, so no story sees another's clicks. */
export function resetDb(now: Date, scenario: Scenario = 'seeded') {
  db = seed(now);
  const apply = typeof scenario === 'function' ? scenario : scenarios[scenario];
  if (!apply) throw new Error(`No account scenario named "${scenario}"`);
  apply(db);
}

export function getDb(): Db {
  if (!db) throw new Error('The fake API has no account: resetDb() first.');
  return db;
}

/**
 * `parameters` choosing a story's account: a scenario by name, or the seeded
 * account edited. Typed, where a bare `db:` key would take a typo silently.
 */
export const account = (scenario: Scenario) => ({ db: scenario });
