'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type ClientWithScale, type Project } from '@/lib/client/api';
import { FilterTabs, Listing, Page } from './page';
import { Pip } from './home-shell';
import { ProjectDialog } from './project-dialog';
import { ProjectRate } from './project-rate';
import { formatCurrency } from '@stint/core';
import { keys } from '@/lib/client/query-keys';

type Status = 'archived' | 'all' | null;

/**
 * Every client, with its projects beneath it — the one place both are
 * listed, and the only screen that reaches a project with no client, since
 * there is no client page to open for one.
 *
 * The heading carries the client's own rate, so each row's inherited figure
 * has something to be read against. "No client" is a heading rather than an
 * entity, so it needs no detail page, rate or link.
 */
export function ClientList() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | undefined>();
  /* The filter lives in the URL: the view is linkable and Back returns to
     it, where a local toggle was neither. */
  const params = useSearchParams();
  const raw = params.get('status');
  const status: Status = raw === 'archived' || raw === 'all' ? raw : null;

  const clientQuery = useQuery({
    queryKey: keys.clients({ archived: true, scale: true }),
    /* Archived clients always: under Active they decide which projects are
       hidden, and otherwise their projects would fall into "No client",
       which would be a lie. */
    queryFn: () => api.clients({ includeArchived: true, withScale: true }),
  });
  const projectQuery = useQuery({
    queryKey: keys.projects({ archived: status !== null }),
    queryFn: () => api.projects({ includeArchived: status !== null }),
  });
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });

  const groups = useMemo(
    () =>
      clientQuery.data && projectQuery.data
        ? group(projectQuery.data.projects, clientQuery.data.clients, status)
        : undefined,
    [clientQuery.data, projectQuery.data, status],
  );

  return (
    <Page>
      <header className="flex items-center justify-between gap-3 pb-4">
        <h1 className="type-title text-strong">Clients</h1>
        <div className="flex gap-2">
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden strokeWidth={2.25} />
            Add project
          </Button>
          <Button asChild>
            <Link href="/clients/new">
              <Plus aria-hidden strokeWidth={2.25} />
              Add client
            </Link>
          </Button>
        </div>
      </header>

      <div className="pb-2">
        <FilterTabs
          base="/clients"
          active={status}
          tabs={[
            { key: null, label: 'Active' },
            { key: 'archived', label: 'Archived' },
            { key: 'all', label: 'All' },
          ]}
        />
      </div>

      <Listing
        query={{
          data: groups,
          error: clientQuery.error ?? projectQuery.error,
          isLoading: clientQuery.isLoading || projectQuery.isLoading,
        }}
        empty={
          status === 'archived'
            ? 'Nothing archived.'
            : status === 'all'
              ? 'No clients yet.'
              : 'No clients yet. Add one to set a rate and bill against it.'
        }
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
 * The client's name, linking to it, its summary line and its own rate.
 *
 * "No client" gets none of those: it is a grouping, not a record. Nor is it
 * "Internal work" — null also covers work not yet assigned to a client and
 * speculative work, and only `isBillableDefault` distinguishes them.
 */
function GroupHeading({
  client,
  count,
}: {
  client: ClientWithScale | null;
  count: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Pip color={client?.color} />
          <h2 className="truncate type-region-head text-muted">
            {client ? (
              <Link
                href={`/clients/${client.id}`}
                className="hover:text-strong"
              >
                {client.name}
              </Link>
            ) : (
              'No client'
            )}
          </h2>
          {client?.archivedAt ? (
            <span className="flex-none type-badge text-subtle">Archived</span>
          ) : null}
        </div>
        {client ? <Detail client={client} /> : null}
      </div>

      {/* The heading's rate is what each row's "from …" refers to, so it
          belongs here rather than being repeated on every row. */}
      <span className="flex-none type-support text-subtle">
        {client
          ? client.hourlyRate != null
            ? `${formatCurrency(client.hourlyRate, client.currency ?? undefined)}/h`
            : 'no rate'
          : `${count} ${count === 1 ? 'project' : 'projects'}`}
      </span>
    </div>
  );
}

/**
 * How much work sits under this client: its active projects and what is
 * unbilled, in one line with no interaction. The count is active projects
 * whatever the filter, so under Archived it describes the client, not the
 * rows beneath.
 */
function Detail({ client }: { client: ClientWithScale }) {
  const { projectCount, unbilledAmount } = client;

  const parts: string[] = [];
  if (projectCount > 0) {
    parts.push(
      `${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`,
    );
  }
  /* `0` unbilled is omitted rather than shown: it means everything is
     invoiced, which is the quiet good state and does not need a figure. */
  if (unbilledAmount > 0) {
    parts.push(
      `${formatCurrency(unbilledAmount, client.currency ?? undefined)} unbilled`,
    );
  }
  if (client.email) parts.push(client.email);

  // Nothing to say about an empty client, and a row of zeroes is noise.
  if (parts.length === 0) return null;

  return (
    <span className="mt-0.5 block truncate type-support text-subtle">
      {parts.join(' · ')}
    </span>
  );
}

function Row({
  project,
  client,
  userDefaultRate,
  onEdit,
}: {
  project: Project;
  client: ClientWithScale | null;
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
  client: ClientWithScale | null;
  projects: Project[];
}

/**
 * Clients in name order, then "No client" last.
 *
 * Last because it is the residue, not a peer: everything above is a named
 * engagement and this is what did not belong to one.
 *
 * A project whose client is archived counts as archived, without a write to
 * the project: unarchiving the client then restores exactly what was active
 * before. So under Active an archived client hides with all its projects,
 * and under Archived it shows with all of them.
 */
function group(
  projects: Project[],
  clients: ClientWithScale[],
  status: Status,
): Group[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  const archived = (p: Project) =>
    p.archivedAt != null || byId.get(p.clientId ?? '')?.archivedAt != null;
  const wanted = (p: Project) =>
    status === 'all' || (status === 'archived') === archived(p);

  const named: Group[] = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((client) => ({
      client,
      projects: projects.filter((p) => p.clientId === client.id && wanted(p)),
    }))
    /* Every client in the view, even one with no projects: this is the only
       list of clients. An active client under Archived shows only when it
       has an archived project to hold. */
    .filter(
      ({ client, projects }) =>
        projects.length > 0 ||
        status === 'all' ||
        (status === 'archived') === (client!.archivedAt != null),
    );

  /* A project whose client is missing (not merely archived) would otherwise
     vanish. Keep it visible under "No client" rather than dropping a row. */
  const orphaned = projects.filter(
    (p) => (p.clientId == null || !byId.has(p.clientId)) && wanted(p),
  );
  return orphaned.length > 0
    ? [...named, { client: null, projects: orphaned }]
    : named;
}
