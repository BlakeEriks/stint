'use client';

import { useState } from 'react';
import { useDialog } from '@/lib/client/use-dialog';
import { useQuery } from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { Archive, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type Client, type Project } from '@/lib/client/api';
import { Listing } from './page';
import { ProjectDialog } from './project-dialog';
import { ProjectRate } from './project-rate';
import { keys, listsArchived } from '@/lib/client/query-keys';

/**
 * The projects belonging to one client.
 *
 * `/clients` lists them across clients; here they sit under the one they
 * belong to. A project is meaningless without its client — the rate hierarchy
 * runs `project -> client -> default` — and nested under the client, the
 * inherited rate is right there to compare against.
 *
 * Archive, never delete: entries and invoices reference projects.
 */
export function ClientProjects({ client }: { client: Client }) {
  const [creating, setCreating] = useState(false);
  const editing = useDialog<Project>();

  /* An archived client's projects all count as archived, so without them
     the page would say "No projects." of a client that has some. */
  const archived = client.archivedAt != null;
  const query = useQuery({
    queryKey: keys.projects(
      archived ? { clientId: client.id, archived } : { clientId: client.id },
    ),
    queryFn: () =>
      api.projects({ clientId: client.id, includeArchived: archived }),
    select: (r) => r.projects,
  });

  // The user default is the last link in the chain, so the row cannot say
  // where a rate came from without it.
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: () => api.settings(),
  });

  return (
    <section className="border-t border-edge-subtle pt-[18px]">
      <header className="flex items-center justify-between gap-3 pb-3">
        <h2 className="type-section text-strong">Projects</h2>
        {/* An archived client is a finished engagement, so there is nothing
            to add work to. The header drops its Archive button the same way
            once archived. */}
        {!client.archivedAt ? (
          <Button variant="ghost" onClick={() => setCreating(true)}>
            <Plus aria-hidden strokeWidth={2.25} />
            Add project
          </Button>
        ) : null}
      </header>

      <Listing
        query={query}
        tight
        empty={
          client.archivedAt
            ? 'No projects.'
            : 'No projects yet. Time can be tracked against the client directly, but a project is how work gets grouped on an invoice.'
        }
      >
        {(projects) => (
          <ul className="divide-y divide-edge-subtle">
            {projects.map((project) => (
              <li key={project.id}>
                <Row
                  project={project}
                  client={client}
                  userDefaultRate={settings?.defaultHourlyRate ?? null}
                  onEdit={() => editing.show(project)}
                />
              </li>
            ))}
          </ul>
        )}
      </Listing>

      <ProjectDialog
        open={creating}
        onOpenChange={setCreating}
        defaultClientId={client.id}
      />
      <ProjectDialog
        open={editing.open}
        onOpenChange={editing.onOpenChange}
        existing={editing.subject}
      />
    </section>
  );
}

function Row({
  project,
  client,
  userDefaultRate,
  onEdit,
}: {
  project: Project;
  client: Client;
  userDefaultRate: number | null;
  onEdit: () => void;
}) {
  /* Predicted: the row leaves every project list on the press. A rejection
     puts it back and the notice says why — not this row, which unmounted
     with the prediction and so holds no error. */
  const archive = useOptimisticMutation<void, unknown, unknown>({
    queryKey: () => keys.projects(),
    // Named, so the notice says which archive was refused.
    mutationFn: () =>
      api.archiveProject(project.id).catch((e: Error) => {
        throw new Error(`Couldn’t archive ${project.name}. ${e.message}`);
      }),
    predict: (current, _vars, key) =>
      isProjectList(current) && !listsArchived(key)
        ? {
            ...current,
            projects: current.projects.filter((p) => p.id !== project.id),
          }
        : current,
  });

  return (
    <div>
      <div className="flex items-center gap-3 py-3">
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
              aria-label={`Archive ${project.name}`}
            >
              <Archive aria-hidden strokeWidth={1.75} />
              Archive
            </Button>
          ) : (
            <span className="px-2 type-badge text-subtle">Archived</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A list response under `keys.projects()`. */
function isProjectList(
  data: unknown,
): data is { projects: Array<{ id: string }> } {
  return typeof data === 'object' && data !== null && 'projects' in data;
}
