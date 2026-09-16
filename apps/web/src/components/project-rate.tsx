'use client';

import { resolveRate } from '@stint/core';
import type { Client, Project } from '@/lib/client/api';
import { formatCurrency } from '@stint/core';

/**
 * The resolved rate a project bills at — the figure alone, not its source.
 *
 * Most projects store no rate of their own, so printing `project.rate` would
 * show nothing for the common case, the opposite of the truth. Resolution is
 * otherwise invisible until an invoice preview, which is late.
 *
 * `resolveRate` comes from `@stint/core` — the same function that bills, kept
 * in step with SQL's `resolve_entry_rate()` by `apps/web/test/rates.test.ts`.
 *
 * `client` is null for work with no client, where the chain simply skips that
 * level. Do not read a missing client as "internal": null covers genuinely
 * internal work, work not yet assigned, and speculative work, and only
 * `isBillableDefault` distinguishes them.
 */
export function ProjectRate({
  project,
  client,
  userDefaultRate,
}: {
  project: Project;
  client: Client | null;
  userDefaultRate: number | null;
}) {
  if (!project.isBillableDefault) {
    return (
      <p className="mt-0.5 type-support text-subtle">Non-billable by default</p>
    );
  }

  const ctx = {
    projectRate: project.hourlyRate,
    clientRate: client?.hourlyRate ?? null,
    userDefaultRate,
  };
  const rate = resolveRate(ctx);

  /* No rate anywhere is not cosmetic: invoicing REFUSES to generate from
     unrated entries, so without this the failure is discovered at the moment
     of billing. The danger channel is right — it is a blocked invoice. */
  if (rate == null) {
    return (
      <p className="mt-0.5 type-support text-danger">
        No rate — invoicing will refuse this work
      </p>
    );
  }

  return (
    <p className="mt-0.5 type-amount text-primary">
      {formatCurrency(rate, client?.currency ?? undefined)}/h
    </p>
  );
}
