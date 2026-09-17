'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { keys } from './query-keys';

/**
 * The swatch for internal work, which has no CLIENT and therefore no colour.
 *
 * Grey is not a client's colour and never becomes one — it is what a swatch
 * draws when there is no colour to draw, so internal work stays legible in a
 * row or a graph beside the clients rather than vanishing from it. One
 * constant, because the same grey in three components diverges the moment one
 * of them is edited.
 */
export const INTERNAL_SWATCH = 'var(--color-subtle)';

/**
 * Resolves each project to its CLIENT's colour.
 *
 * Internal work (`clientId === null`) resolves to `null`: the absence is the
 * answer, and `INTERNAL_SWATCH` is what renders it.
 */
export function useProjectColors(): Map<string, string | null> {
  const { colorByProject } = useProjectClients();
  return colorByProject;
}

/**
 * The same resolution, plus the client each project belongs to, for a legend
 * that groups by client: two projects for one client are one entry with one
 * swatch. Both come out of the same two queries, so this is one hook rather
 * than a second set of fetches that could disagree with the colours already
 * painted.
 *
 * **Archived clients are included.** Work billed to a finished engagement is
 * still in the history, and dropping its colour would silently move those
 * hours into the unnamed band.
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
