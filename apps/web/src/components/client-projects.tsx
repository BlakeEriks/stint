'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError, type Client, type Project } from '@/lib/client/api';
import { ProjectDialog } from './project-dialog';
import { ProjectRate } from './project-rate';

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
    <div className="border-t border-edge-subtle first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate type-body text-strong">{project.name}</p>
          <ProjectRate
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

      {/* In the row, naming the project: a list of identical failures at the
          foot of the card could not say which archive was refused. */}
      {archive.error ? (
        <p role="alert" className="px-4 pb-3 type-support text-danger">
          {archive.error instanceof ApiError
            ? archive.error.message
            : `Could not archive ${project.name}.`}
        </p>
      ) : null}
    </div>
  );
}
