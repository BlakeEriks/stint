import { localDateTimeToInstant } from '../calendar.ts';
import { findOverlaps } from '../overlaps.ts';
import { resolveRate, resolveRateSource } from '../rates.ts';
import { deterministicUuidv7 } from '../uuid.ts';

export type ImportSource = 'toggl';

/** One export row, as the source reported it — nothing matched or resolved. */
export interface ParsedRow {
  /** Stable across re-exports of the same entry; the id derives from it. */
  sourceRowId: string;
  clientName: string | null;
  projectName: string | null;
  taskName: string;
  /** Wall clock in the contractor's zone: `YYYY-MM-DD`, `HH:MM:SS`. */
  startDate: string;
  startTime: string;
  endDate: string | null;
  endTime: string | null;
  reportedDurationSeconds: number | null;
  /** The source tool's own figure. Shown, never used to derive a rate. */
  reportedAmount: number | null;
  billable: boolean | null;
}

export type ExcludedReason = 'no_end_time' | 'not_after_start';

export interface ImportRow {
  id: string;
  sourceRowId: string;
  clientName: string | null;
  projectName: string | null;
  clientId: string | null;
  projectId: string | null;
  willCreateClient: boolean;
  willCreateProject: boolean;
  taskName: string;
  startedAt: string;
  endedAt: string | null;
  billable: boolean;
  invoicedElsewhere: boolean;
  resolvedRate: number | null;
  rateSource: ReturnType<typeof resolveRateSource>;
  reportedAmount: number | null;
  willWrite: boolean;
  /** Written by an earlier import of the same row; confirming leaves it be. */
  alreadyImported: boolean;
  excludedReason: ExcludedReason | null;
  /** Left out by the contractor to settle an overlap. */
  excluded: boolean;
}

/** A row from the file that overlaps other work, at its longest overlap. */
export interface ImportOverlap {
  rowId: string;
  sourceRowId: string;
  taskName: string;
  startedAt: string;
  otherTaskName: string;
  /** The other entry is already in Stint, rather than elsewhere in the file. */
  otherInStint: boolean;
  seconds: number;
  excluded: boolean;
}

/** A client the file's work lands in. */
export interface ImportClient {
  id: string;
  /** Its name as matched; the key its choices come back under. */
  key: string;
  name: string;
  isNew: boolean;
  /** Its own rate if it exists, the one chosen here if the import creates it. */
  hourlyRate: number | null;
  color: string | null;
  invoicedThrough: string | null;
  seconds: number;
}

/** What the contractor chose for one client, keyed by its name as matched. */
export interface ClientChoice {
  /** `YYYY-MM-DD`: its entries starting on or before it were invoiced elsewhere. */
  invoicedThrough?: string | null;
  /** Only for a client the import creates. */
  hourlyRate?: number | null;
  /** Only for a client the import creates. */
  color?: string | null;
}

export interface ImportPreview {
  source: ImportSource;
  rows: ImportRow[];
  clients: ImportClient[];
  newProjects: { id: string; name: string; clientId: string | null }[];
  /** Longest first. */
  overlaps: ImportOverlap[];
  defaultRate: number | null;
  summary: {
    totalRows: number;
    willWriteCount: number;
    /** Rows confirming would actually add — `willWriteCount` less those already here. */
    newCount: number;
    alreadyImportedCount: number;
    unratedCount: number;
    /** Overlaps not yet excluded. */
    overlappingCount: number;
    excludedCount: number;
    invoicedElsewhereCount: number;
    /** The span of the new rows, so a wrong zone shows before anything is written. */
    firstStartedAt: string | null;
    lastEndedAt: string | null;
    /**
     * Toggl's free plan marks every entry not billable, so an export that
     * says No on every row is the plan talking, not the contractor.
     */
    exportedNoneBillable: boolean;
  };
}

export interface ImportResult {
  source: ImportSource;
  written: number;
  alreadyImported: number;
  unrated: number;
  overlapping: number;
  excluded: number;
  invoicedElsewhere: number;
}

export interface ImportContext {
  userId: string;
  /** Import every row as billable, whatever the export says. */
  allBillable: boolean;
  /** Keyed by the client's name as matched — see `clientKey`. */
  choices: Record<string, ClientChoice>;
  /** Source row ids to leave out. Honoured only for a row that overlaps. */
  excluded: string[];
  /** Stopped entries already in the account around the export's dates. */
  existing: {
    id: string;
    taskName: string;
    startedAt: string;
    endedAt: string;
  }[];
  timeZone: string;
  defaultRate: number | null;
  clients: {
    id: string;
    name: string;
    hourlyRate: number | null;
    color: string | null;
    archived: boolean;
  }[];
  projects: {
    id: string;
    name: string;
    clientId: string | null;
    hourlyRate: number | null;
    isBillableDefault: boolean;
    archived: boolean;
  }[];
}

/** How a client or project name matches: case and surrounding spaces ignored. */
export const clientKey = (s: string) => s.trim().toLowerCase();
const norm = clientKey;

/** Active before archived, so history lands on the project still in use. */
const pick = <T extends { archived: boolean }>(xs: T[]) =>
  xs.find((x) => !x.archived) ?? xs[0];

function instant(date: string, time: string, tz: string): Date {
  const seconds = Number(time.split(':')[2] ?? 0);
  return new Date(
    localDateTimeToInstant(date, time, tz).getTime() + seconds * 1000,
  );
}

/**
 * The one computation behind both the preview a contractor reviews and the
 * rows the confirm route writes, so the two cannot disagree.
 */
export async function buildPreview(
  source: ImportSource,
  parsed: ParsedRow[],
  ctx: ImportContext,
): Promise<ImportPreview> {
  const newClients = new Map<string, { id: string; name: string }>();
  const newProjects = new Map<
    string,
    { id: string; name: string; clientId: string | null }
  >();
  const rows: ImportRow[] = [];

  for (const p of parsed) {
    const start = instant(p.startDate, p.startTime, ctx.timeZone);
    const end =
      p.endDate && p.endTime
        ? instant(p.endDate, p.endTime, ctx.timeZone)
        : null;

    let clientId: string | null = null;
    let clientRate: number | null = null;
    let willCreateClient = false;
    const choice = p.clientName ? ctx.choices[norm(p.clientName)] : undefined;
    if (p.clientName) {
      const key = norm(p.clientName);
      const found = pick(ctx.clients.filter((c) => norm(c.name) === key));
      if (found) {
        clientId = found.id;
        clientRate = found.hourlyRate;
      } else {
        const known = newClients.get(key);
        clientId =
          known?.id ??
          (await deterministicUuidv7(
            `${ctx.userId}|client|${key}`,
            start.getTime(),
          ));
        if (!known)
          newClients.set(key, { id: clientId, name: p.clientName.trim() });
        clientRate = choice?.hourlyRate ?? null;
        willCreateClient = true;
      }
    }

    let projectId: string | null = null;
    let projectRate: number | null = null;
    let billableDefault = true;
    let willCreateProject = false;
    if (p.projectName) {
      const key = norm(p.projectName);
      // With no client in the export, the name alone identifies the project
      // — the contractor may have given it a client here since.
      const found = pick(
        ctx.projects.filter(
          (x) =>
            norm(x.name) === key && (!p.clientName || x.clientId === clientId),
        ),
      );
      if (found) {
        projectId = found.id;
        projectRate = found.hourlyRate;
        billableDefault = found.isBillableDefault;
      } else {
        const mapKey = `${clientId ?? ''}|${key}`;
        const known = newProjects.get(mapKey);
        projectId =
          known?.id ??
          (await deterministicUuidv7(
            `${ctx.userId}|project|${mapKey}`,
            start.getTime(),
          ));
        if (!known)
          newProjects.set(mapKey, {
            id: projectId,
            name: p.projectName.trim(),
            clientId,
          });
        willCreateProject = true;
      }
    }

    const rateCtx = {
      entryRateOverride: null,
      projectRate,
      clientRate,
      userDefaultRate: ctx.defaultRate,
    };
    const excludedReason: ExcludedReason | null = !end
      ? 'no_end_time'
      : end <= start
        ? 'not_after_start'
        : null;
    const through = choice?.invoicedThrough ?? null;

    rows.push({
      id: await deterministicUuidv7(
        `${ctx.userId}|${source}|${p.sourceRowId}`,
        start.getTime(),
      ),
      sourceRowId: p.sourceRowId,
      clientName: p.clientName,
      projectName: p.projectName,
      clientId,
      projectId,
      willCreateClient,
      willCreateProject,
      taskName: p.taskName,
      startedAt: start.toISOString(),
      endedAt: end?.toISOString() ?? null,
      billable: ctx.allBillable || (p.billable ?? billableDefault),
      invoicedElsewhere: through !== null && p.startDate <= through,
      resolvedRate: resolveRate(rateCtx),
      rateSource: resolveRateSource(rateCtx),
      reportedAmount: p.reportedAmount,
      willWrite: excludedReason === null,
      alreadyImported: false,
      excludedReason,
      excluded: false,
    });
  }

  /* A row already imported is the same id as its existing copy, so it is
     that copy — in Stint, not in the file. */
  const existingIds = new Set(ctx.existing.map((e) => e.id));
  for (const r of rows)
    if (r.willWrite && existingIds.has(r.id)) r.alreadyImported = true;

  const overlaps = listOverlaps(
    rows.filter((r) => r.willWrite && !r.alreadyImported),
    ctx,
  );
  const excludedIds = new Set(
    overlaps.filter((o) => o.excluded).map((o) => o.rowId),
  );
  for (const r of rows)
    if (excludedIds.has(r.id)) {
      r.excluded = true;
      r.willWrite = false;
    }

  const written = rows.filter((r) => r.willWrite);
  const fresh = written.filter((r) => !r.alreadyImported);

  const seconds = new Map<string, number>();
  for (const r of written)
    if (r.clientId)
      seconds.set(
        r.clientId,
        (seconds.get(r.clientId) ?? 0) +
          (Date.parse(r.endedAt as string) - Date.parse(r.startedAt)) / 1000,
      );
  const clients: ImportClient[] = [];
  for (const r of written) {
    if (!r.clientId || !r.clientName) continue;
    if (clients.some((c) => c.id === r.clientId)) continue;
    const key = norm(r.clientName);
    const choice = ctx.choices[key];
    const found = ctx.clients.find((c) => c.id === r.clientId);
    clients.push({
      id: r.clientId,
      key,
      name: found?.name ?? r.clientName.trim(),
      isNew: !found,
      hourlyRate: found ? found.hourlyRate : (choice?.hourlyRate ?? null),
      color: found ? found.color : (choice?.color ?? null),
      invoicedThrough: choice?.invoicedThrough ?? null,
      seconds: seconds.get(r.clientId) ?? 0,
    });
  }
  const usedProjects = new Set(written.map((r) => r.projectId));

  return {
    source,
    rows,
    clients,
    newProjects: [...newProjects.values()].filter((p) =>
      usedProjects.has(p.id),
    ),
    overlaps,
    defaultRate: ctx.defaultRate,
    summary: {
      totalRows: rows.length,
      willWriteCount: written.length,
      newCount: fresh.length,
      alreadyImportedCount: written.length - fresh.length,
      unratedCount: written.filter((r) => r.billable && r.resolvedRate === null)
        .length,
      overlappingCount: overlaps.filter((o) => !o.excluded).length,
      excludedCount: rows.filter((r) => r.excludedReason).length,
      invoicedElsewhereCount: written.filter((r) => r.invoicedElsewhere).length,
      firstStartedAt: fresh.reduce<string | null>(
        (a, r) => (a === null || r.startedAt < a ? r.startedAt : a),
        null,
      ),
      lastEndedAt: fresh.reduce<string | null>(
        (a, r) => (a === null || (r.endedAt as string) > a ? r.endedAt : a),
        null,
      ),
      exportedNoneBillable:
        parsed.length > 0 && parsed.every((p) => p.billable === false),
    },
  };
}

/**
 * Every row from the file sharing more than the grace period with other
 * work, each at its longest overlap, longest first.
 *
 * The listed row is the one from the file; of two from the file, the later —
 * it began inside the other, so it is usually the one to drop. An exclusion
 * is honoured only for a listed row, and an overlap with a row excluded
 * elsewhere is settled, so it drops out unless its own row is excluded too.
 */
function listOverlaps(
  candidates: ImportRow[],
  ctx: ImportContext,
): ImportOverlap[] {
  const file = new Map(candidates.map((r) => [r.id, r]));
  const stint = new Map(ctx.existing.map((e) => [e.id, e]));
  const pairs = findOverlaps([
    ...candidates.map((r) => ({
      id: r.id,
      start: Date.parse(r.startedAt),
      end: Date.parse(r.endedAt as string),
    })),
    ...ctx.existing
      .filter((e) => !file.has(e.id))
      .map((e) => ({
        id: e.id,
        start: Date.parse(e.startedAt),
        end: Date.parse(e.endedAt),
      })),
  ]).flatMap((o) => {
    const row = file.get(o.later) ?? file.get(o.earlier);
    if (!row) return [];
    return [
      {
        row,
        otherId: row.id === o.later ? o.earlier : o.later,
        seconds: o.seconds,
      },
    ];
  });

  const want = new Set(ctx.excluded);
  const listed = new Set(pairs.map((p) => p.row.id));
  const excluded = new Set(
    candidates
      .filter((r) => listed.has(r.id) && want.has(r.sourceRowId))
      .map((r) => r.id),
  );

  const longest = new Map<string, ImportOverlap>();
  for (const { row, otherId, seconds } of pairs) {
    const isExcluded = excluded.has(row.id);
    if (excluded.has(otherId) && !isExcluded) continue;
    if ((longest.get(row.id)?.seconds ?? -1) >= seconds) continue;
    const other = file.get(otherId);
    longest.set(row.id, {
      rowId: row.id,
      sourceRowId: row.sourceRowId,
      taskName: row.taskName,
      startedAt: row.startedAt,
      otherTaskName: other?.taskName ?? stint.get(otherId)?.taskName ?? '',
      otherInStint: !other,
      seconds,
      excluded: isExcluded,
    });
  }
  return [...longest.values()].sort(
    (a, b) => b.seconds - a.seconds || a.startedAt.localeCompare(b.startedAt),
  );
}
