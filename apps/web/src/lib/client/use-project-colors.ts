'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { keys } from './query-keys';

/**
 * Resolves each project to its CLIENT's colour.
 *
 * Colour identifies a client. A project is a subdivision of one that is
 * already identified — its name does that work — so projects have no colour
 * of their own, and every project under a client shares the client's hue.
 *
 * Internal work (`clientId === null`) resolves to `null` rather than a shared
 * grey: a grey shared by everything unbilled would read as a client of its
 * own.
 */
export function useProjectColors(): Map<string, string | null> {
  const { colorByProject } = useProjectClients();
  return colorByProject;
}

/**
 * The same resolution, plus the client each project belongs to.
 *
 * A legend groups by CLIENT — colour identifies a client, so two projects for
 * one client are one entry with one swatch, not two identical rows. That needs
 * the client id and name, which `useProjectColors` deliberately throws away.
 *
 * Both come out of the same two queries, so this is one hook rather than a
 * second set of fetches that could disagree with the colours already painted.
 *
 * **Archived clients are included.** Work billed to a finished engagement is
 * still in the history, and dropping its colour would silently move those
 * hours into the unnamed band — the same reason `activity-chart.tsx` asks for
 * them.
 */
export function useProjectClients(): {
  colorByProject: Map<string, string | null>;
  /** Project id -> its client, absent for internal work. */
  clientByProject: Map<string, { id: string; name: string; color: string }>;
} {
  const projects = useQuery({
    queryKey: keys.projects(),
    queryFn: () => api.projects(),
  });
  const clients = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });

  const byId = new Map((clients.data?.clients ?? []).map((c) => [c.id, c]));

  const colorByProject = new Map<string, string | null>();
  const clientByProject = new Map<
    string,
    { id: string; name: string; color: string }
  >();

  for (const p of projects.data?.projects ?? []) {
    const client = p.clientId ? byId.get(p.clientId) : undefined;
    colorByProject.set(p.id, client?.color ?? null);
    if (client?.color) {
      clientByProject.set(p.id, {
        id: client.id,
        name: client.name,
        color: client.color,
      });
    }
  }

  return { colorByProject, clientByProject };
}
