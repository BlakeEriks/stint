'use client';

import { formatCurrency, resolveRate, resolveRateSource } from '@stint/core';
import type { Client, Project } from '@/lib/client/api';

const SOURCE = {
  entry: 'own rate',
  project: 'own rate',
  client: 'from client',
  default: 'from default',
  none: '',
} as const;

export const rateLabel = (rate: number, client: Client | null) =>
  `${formatCurrency(rate, client?.currency ?? undefined)}/h`;

/**
 * The rate a project bills at, with where that rate comes from, so it's
 * plain whether changing the client's rate would move it.
 *
 * Most projects store no rate of their own, so printing `project.rate` would
 * show nothing for the common case, the opposite of the truth.
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
    return <span className="type-support text-subtle">Non-billable</span>;
  }

  const ctx = {
    projectRate: project.hourlyRate,
    clientRate: client?.hourlyRate ?? null,
    userDefaultRate,
  };
  const rate = resolveRate(ctx);

  /* Not cosmetic: invoicing refuses unrated entries, so this is found here
     rather than at billing. */
  if (rate == null) {
    return <span className="type-support text-danger">No rate</span>;
  }

  return (
    <>
      <span
        className={`block type-duration ${project.hourlyRate != null ? 'text-primary' : 'text-muted'}`}
      >
        {rateLabel(rate, client)}
      </span>
      <span className="block type-meta text-subtle max-sm:hidden">
        {SOURCE[resolveRateSource(ctx)]}
      </span>
    </>
  );
}
