'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { resolveRate, resolveRateSource } from '@stint/core';
import { Button } from '@/components/ui/button';
import { api, type Client, type Project } from '@/lib/client/api';
import { ProjectDialog } from './project-dialog';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * The projects belonging to one client.
 *
 * There is no `/projects` page and this is why: a project is meaningless
 * without its client — the rate hierarchy runs `project -> client -> default`
 * — so a flat list mixing three clients' work has to be decoded before it can
 * be read. Nested under the client, the inherited rate is right there to
 * compare against.
 *
 * Archive, never delete: entries and invoices reference projects.
 */
export function ClientProjects({ client }: { client: Client }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', { clientId: client.id }],
    queryFn: () => api.projects({ clientId: client.id }),
  });
  const projects = data?.projects ?? [];

  // The user default is the last link in the chain, so the row cannot say
  // where a rate came from without it.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings(),
  });

  return (
    <section className="mt-6">
      <header className="flex items-center justify-between gap-3 pb-3">
        <h2 className="type-section text-strong">Projects</h2>
        {/* An archived client is a finished engagement, so there is nothing
            to add work to. The header drops its Archive button the same way
            once archived. */}
        {!client.archivedAt ? (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus aria-hidden strokeWidth={2.25} />
            Add project
          </Button>
        ) : null}
      </header>

      <div className="overflow-hidden rounded-xl border border-edge-subtle bg-surface-primary shadow-card">
        {isLoading ? (
          <p className="px-4 py-6 type-support text-subtle">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="px-4 py-6 type-support text-subtle">
            {client.archivedAt
              ? 'No projects.'
              : 'No projects yet. Time can be tracked against the client directly, but a project is how work gets grouped on an invoice.'}
          </p>
        ) : (
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <Row
                  project={project}
                  client={client}
                  userDefaultRate={settings?.defaultHourlyRate ?? null}
                  onEdit={() => setEditing(project)}
                  onArchived={() =>
                    queryClient.invalidateQueries({ queryKey: ['projects'] })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProjectDialog
        open={creating}
        onOpenChange={setCreating}
        defaultClientId={client.id}
      />
      <ProjectDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        existing={editing}
      />
    </section>
  );
}

function Row({
  project,
  client,
  userDefaultRate,
  onEdit,
  onArchived,
}: {
  project: Project;
  client: Client;
  userDefaultRate: number | null;
  onEdit: () => void;
  onArchived: () => void;
}) {
  const archive = useMutation({
    mutationFn: () => api.archiveProject(project.id),
    onSuccess: onArchived,
  });

  return (
    <div
      className="flex items-center gap-3 border-t border-edge-subtle px-4 py-3
                 first:border-t-0"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate type-body text-strong">{project.name}</p>
        <Rate
          project={project}
          client={client}
          userDefaultRate={userDefaultRate}
        />
      </div>

      <div className="flex flex-none items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${project.name}`}
        >
          <Pencil aria-hidden strokeWidth={1.75} />
          Edit
        </Button>
        {!project.archivedAt ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => archive.mutate()}
            disabled={archive.isPending}
            aria-label={`Archive ${project.name}`}
          >
            Archive
          </Button>
        ) : (
          <span className="px-2 type-badge text-subtle">Archived</span>
        )}
      </div>
    </div>
  );
}

/**
 * The rate this project actually bills at, and WHERE IT CAME FROM.
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
 * database. A third implementation here is a third thing to drift.
 */
function Rate({
  project,
  client,
  userDefaultRate,
}: {
  project: Project;
  client: Client;
  userDefaultRate: number | null;
}) {
  if (!project.isBillableDefault) {
    return (
      <p className="mt-0.5 type-support text-subtle">Non-billable by default</p>
    );
  }

  const ctx = {
    projectRate: project.hourlyRate,
    clientRate: client.hourlyRate,
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
  client: Client,
): string {
  switch (source) {
    /* Name what it overrides, not just that it overrides: the comparison is
       the reason to look. */
    case 'project':
      return client.hourlyRate != null
        ? `overrides ${client.name}'s ${usd.format(client.hourlyRate)}`
        : 'set on this project';
    case 'client':
      return `from ${client.name}`;
    default:
      return 'your default rate';
  }
}
