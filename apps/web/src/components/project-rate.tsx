'use client';

import { resolveRate } from '@stint/core';
import type { Client, Project } from '@/lib/client/api';
import { money } from '@/lib/client/format';

/**
 * The rate a project actually bills at, and WHERE IT CAME FROM.
 *
 * Most projects store no rate of their own, so printing the column would show
 * nothing for the common case — the opposite of the truth, since the project
 * does bill at a rate, just not one stored on it. Resolution is otherwise
 * invisible until an invoice preview, which is late.
 *
 * **The figure alone, not where it came from.** Naming the source on every
 * row ("from Northwind Trading", "overrides Northwind Trading's $150.00") put
 * a sentence under each project and read as clutter — and on `/projects` it
 * restated the client heading directly above it. The number is what gets
 * checked; the hierarchy is visible in the grouping and in the dialog that
 * sets it.
 *
 * `resolveRate` comes from `@stint/core` — the same function that bills, kept
 * in step with SQL's `resolve_entry_rate()` by `apps/web/test/rates.test.ts`.
 * A second implementation here is another thing to drift, which is also why
 * this component is shared by the client's own projects section and the
 * grouped `/projects` list rather than copied into both.
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
      {money(rate, client?.currency ?? undefined)}/h
    </p>
  );
}
