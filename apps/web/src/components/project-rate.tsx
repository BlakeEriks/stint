'use client';

import { resolveRate, resolveRateSource } from '@stint/core';
import type { Client, Project } from '@/lib/client/api';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * The rate a project actually bills at, and WHERE IT CAME FROM.
 *
 * Most projects store no rate of their own, so printing the column would show
 * nothing for the common case — the opposite of the truth, since the project
 * does bill at a rate, just not one stored on it. Resolution is otherwise
 * invisible until an invoice preview, which is late: answering "what does
 * this client's work bill at?" meant opening every project to check for an
 * override.
 *
 * `resolveRate`/`resolveRateSource` come from `@stint/core` — the same
 * functions the invoice preview uses, mirroring `resolve_entry_rate()` in the
 * database. A third implementation here is a third thing to drift, which is
 * also why this component is shared by the client's own projects section and
 * the grouped `/projects` list rather than copied into both.
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
  const source = resolveRateSource(ctx);

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
    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 type-support text-muted">
      <span className="type-amount text-primary">{usd.format(rate)}/h</span>
      <span>{explain(source, client)}</span>
    </p>
  );
}

function explain(
  source: ReturnType<typeof resolveRateSource>,
  client: Client | null,
): string {
  switch (source) {
    /* Name what it overrides, not just that it overrides: the comparison is
       the reason to look. */
    case 'project':
      return client?.hourlyRate != null
        ? `overrides ${client.name}'s ${usd.format(client.hourlyRate)}`
        : 'set on this project';
    case 'client':
      return client ? `from ${client.name}` : 'from the client';
    default:
      return 'your default rate';
  }
}
