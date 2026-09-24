'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Client, type Project } from '@/lib/client/api';
import { Listing, Page } from './page';
import { Pip } from './home-shell';
import { ProjectDialog } from './project-dialog';
import { ProjectRate } from './project-rate';
import { formatCurrency } from '@stint/core';
import { keys } from '@/lib/client/query-keys';

/**
 * Every project, grouped by client — which is the only screen that reaches a
 * project with no client, since there is no client page to open for one.
 *
 * The heading carries the client's own rate, so each row's inherited figure
 * has something to be read against. "No client" is a heading rather than an
 * entity, so it needs no detail page, rate or Edit button.
 */
export function ProjectList() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>();
  const [showArchived, setShowArchived] = useState(false);

  const projectQuery = useQuery({
    queryKey: keys.projects({ archived: showArchived }),
    queryFn: () => api.projects({ includeArchived: showArchived }),
  });
  const { data: clientData } = useQuery({
    queryKey: keys.clients({ archived: true }),
    // Archived clients included: their projects still exist and would
    // otherwise fall into "No client", which would be a lie.
    queryFn: () => api.clients({ includeArchived: true }),
  });
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });

  const groups = useMemo(
    () => group(projectQuery.data?.projects ?? [], clientData?.clients ?? []),
    [projectQuery.data, clientData],
  );

  return (
    <Page>
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="type-title text-strong">Projects</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden strokeWidth={2.25} />
          Add project
        </Button>
      </header>

      <Listing
        query={{
          ...projectQuery,
          data: projectQuery.data ? groups : undefined,
        }}
        empty="No projects yet. A project groups time entries and sets the rate they bill at."
      >
        {(shown) => (
          <div>
            {shown.map((g) => (
              <section
                key={g.client?.id ?? '__none__'}
                className="border-t border-edge-subtle py-[18px]"
              >
                <GroupHeading client={g.client} count={g.projects.length} />
                <ul className="divide-y divide-edge-subtle">
                  {g.projects.map((project) => (
                    <li key={project.id}>
                      <Row
                        project={project}
                        client={g.client}
                        userDefaultRate={settings?.defaultHourlyRate ?? null}
                        onEdit={() => setEditing(project)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Listing>

      <button
        type="button"
        onClick={() => setShowArchived((v) => !v)}
        className="mt-4 px-1 type-label text-subtle hover:text-muted"
      >
        {showArchived ? 'Hide archived' : 'Show archived'}
      </button>

      <ProjectDialog open={creating} onOpenChange={setCreating} />
      <ProjectDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        existing={editing}
      />
    </Page>
  );
}

/**
 * The client's name, its own rate, and a link to manage it.
 *
 * "No client" gets none of those: it is a grouping, not a record. Nor is it
 * "Internal work" — null also covers work not yet assigned to a client and
 * speculative work, and only `isBillableDefault` distinguishes them.
 */
function GroupHeading({
  client,
  count,
}: {
  client: Client | null;
  count: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2">
      <div className="flex min-w-0 items-center gap-2">
        <Pip color={client?.color} />
        <h2 className="truncate type-region-head text-muted">
          {client ? client.name : 'No client'}
        </h2>
        {client?.archivedAt ? (
          <span className="flex-none type-badge text-subtle">Archived</span>
        ) : null}
      </div>

      <div className="flex flex-none items-baseline gap-3">
        {/* The heading's rate is what each row's "from …" refers to, so it
            belongs here rather than being repeated on every row. */}
        <span className="type-support text-subtle">
          {client
            ? client.hourlyRate != null
              ? `${formatCurrency(client.hourlyRate, client.currency ?? undefined)}/h`
              : 'no rate'
            : `${count} ${count === 1 ? 'project' : 'projects'}`}
        </span>
        {client ? (
          <Link
            href={`/clients/${client.id}`}
            className="type-support text-subtle hover:text-muted"
          >
            Manage
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  project,
  client,
  userDefaultRate,
  onEdit,
}: {
  project: Project;
  client: Client | null;
  userDefaultRate: number | null;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate type-body text-strong">{project.name}</p>
        <ProjectRate
          project={project}
          client={client}
          userDefaultRate={userDefaultRate}
        />
      </div>
      {project.archivedAt ? (
        <span className="flex-none px-2 type-badge text-subtle">Archived</span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label={`Edit ${project.name}`}
        className="flex-none"
      >
        <Pencil aria-hidden strokeWidth={1.75} />
        Edit
      </Button>
    </div>
  );
}

interface Group {
  client: Client | null;
  projects: Project[];
}

/**
 * Clients in name order, then "No client" last.
 *
 * Last because it is the residue, not a peer: everything above is a named
 * engagement and this is what did not belong to one. A client with no
 * projects is omitted — the clients list is where an empty client belongs.
 */
function group(projects: Project[], clients: Client[]): Group[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const grouped = new Map<string, Project[]>();
  for (const project of projects) {
    const key = project.clientId ?? '';
    const existing = grouped.get(key);
    if (existing) existing.push(project);
    else grouped.set(key, [project]);
  }

  const named: Group[] = [];
  for (const [key, list] of grouped) {
    if (key === '') continue;
    const client = byId.get(key);
    // A project whose client is missing (not merely archived) would otherwise
    // vanish. Keep it visible under "No client" rather than dropping a row.
    if (!client) continue;
    named.push({ client, projects: list });
  }
  named.sort((a, b) =>
    (a.client?.name ?? '').localeCompare(b.client?.name ?? ''),
  );

  const orphaned = [
    ...(grouped.get('') ?? []),
    ...projects.filter((p) => p.clientId != null && !byId.has(p.clientId)),
  ];
  return orphaned.length > 0
    ? [...named, { client: null, projects: orphaned }]
    : named;
}
