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
  /** The export's own duration figure, shown when it disagrees. */
  reportedSeconds: number | null;
  durationDisagreement: boolean;
  overlapsWith: string[];
  willWrite: boolean;
  excludedReason: ExcludedReason | null;
}

export interface ImportPreview {
  source: ImportSource;
  rows: ImportRow[];
  newClients: { id: string; name: string }[];
  newProjects: { id: string; name: string; clientId: string | null }[];
  summary: {
    totalRows: number;
    willWriteCount: number;
    unratedCount: number;
    overlappingCount: number;
    excludedCount: number;
    invoicedElsewhereCount: number;
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
  /** `YYYY-MM-DD`: entries starting on or before it were invoiced elsewhere. */
  invoicedThrough: string | null;
  /** Stopped entries already in the account around the export's dates. */
  existing: { id: string; startedAt: string; endedAt: string }[];
  timeZone: string;
  defaultRate: number | null;
  clients: {
    id: string;
    name: string;
    hourlyRate: number | null;
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

const norm = (s: string) => s.trim().toLowerCase();

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
      invoicedElsewhere:
        ctx.invoicedThrough !== null && p.startDate <= ctx.invoicedThrough,
      resolvedRate: resolveRate(rateCtx),
      rateSource: resolveRateSource(rateCtx),
      reportedAmount: p.reportedAmount,
      reportedSeconds: p.reportedDurationSeconds,
      durationDisagreement:
        end != null &&
        p.reportedDurationSeconds != null &&
        Math.abs(
          p.reportedDurationSeconds - (end.getTime() - start.getTime()) / 1000,
        ) > 1,
      overlapsWith: [],
      willWrite: excludedReason === null,
      excludedReason,
    });
  }

  const written = rows.filter((r) => r.willWrite);

  /* Against itself and against what is already here. A row already imported
     is the same id as its existing copy, not an overlap with it. */
  const ours = new Set(written.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const o of findOverlaps([
    ...written.map((r) => ({
      id: r.id,
      start: Date.parse(r.startedAt),
      end: Date.parse(r.endedAt as string),
    })),
    ...ctx.existing
      .filter((e) => !ours.has(e.id))
      .map((e) => ({
        id: e.id,
        start: Date.parse(e.startedAt),
        end: Date.parse(e.endedAt),
      })),
  ])) {
    byId.get(o.earlier)?.overlapsWith.push(o.later);
    byId.get(o.later)?.overlapsWith.push(o.earlier);
  }

  const usedClients = new Set(written.map((r) => r.clientId));
  const usedProjects = new Set(written.map((r) => r.projectId));

  return {
    source,
    rows,
    newClients: [...newClients.values()].filter((c) => usedClients.has(c.id)),
    newProjects: [...newProjects.values()].filter((p) =>
      usedProjects.has(p.id),
    ),
    summary: {
      totalRows: rows.length,
      willWriteCount: written.length,
      unratedCount: written.filter((r) => r.billable && r.resolvedRate === null)
        .length,
      overlappingCount: rows.filter((r) => r.overlapsWith.length > 0).length,
      excludedCount: rows.length - written.length,
      invoicedElsewhereCount: written.filter((r) => r.invoicedElsewhere).length,
      exportedNoneBillable:
        parsed.length > 0 && parsed.every((p) => p.billable === false),
    },
  };
}
