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
  | 'runaway'
  | 'empty'
  | ((db: Db) => void);

const scenarios: Record<
  Exclude<Scenario, (db: Db) => void>,
  (db: Db) => void
> = {
  seeded: () => {},
  // A timer started after lunch, well inside the limit.
  running: (db) => {
    db.entries.push(running(db, '13:45', ids.rush, 'Checkout timeout fix'));
  },
  // Left going since the morning: past `maxTimerHours`.
  runaway: (db) => {
    db.entries.push(
      running(db, '04:10', ids.warehouse, 'Query performance pass'),
    );
  },
  // A new account: settings and nothing else.
  empty: (db) => {
    Object.assign(db, {
      settings: { ...settings(), nextInvoiceNumber: 1 },
      clients: [],
      projects: [],
      entries: [],
      invoices: [],
      paymentProfiles: [],
    });
  },
};

function running(db: Db, time: string, projectId: string, taskName: string) {
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
  (typeof scenario === 'function' ? scenario : scenarios[scenario])(db);
}

export function getDb(): Db {
  if (!db) throw new Error('The fake API has no account: resetDb() first.');
  return db;
}

/** `parameters` for a story whose account is the seeded one, edited. */
export const account = (edit: (db: Db) => void) => ({ db: edit });
