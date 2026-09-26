'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { keys } from './query-keys';

/**
 * The swatch for internal work, which has no CLIENT and therefore no color.
 *
 * Gray is not a client's color and never becomes one — it is what a swatch
 * draws when there is no color to draw, so internal work stays legible in a
 * row or a graph beside the clients rather than vanishing from it. One
 * constant, because the same gray in three components diverges the moment one
 * of them is edited.
 *
 * `--color-subtle`, not `--color-text-subtle`: the generator strips the
 * `text-` Tailwind reads as a utility prefix, so the variable the token file
 * calls `text.subtle` is emitted bare. An undefined `var()` here paints
 * nothing and reports nothing.
 */
export const INTERNAL_SWATCH = 'var(--color-subtle)';

/**
 * Resolves each project to its CLIENT's color.
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
 * than a second set of fetches that could disagree with the colors already
 * painted.
 *
 * **Archived clients are included.** Work billed to a finished engagement is
 * still in the history, and dropping its color would silently move those
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
  const byId = useClients();

  /* Memoized on the query data: these Maps are dependencies of the effects
     and memos that draw a legend, so a fresh identity every render re-runs
     all of them for colors that did not change. */
  return useMemo(() => {
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
  }, [projects.data, byId]);
}

/**
 * Every client by id, for a surface whose figures already come keyed by
 * client rather than by project — the home screen's rollups do.
 *
 * The same query as the project resolution above, so one component asking for
 * both gets one fetch and one set of hues. Archived included, for the reason
 * given there.
 */
export function useClients(): Map<
  string,
  { id: string; name: string; color: string | null }
> {
  const clients = useQuery({
    queryKey: keys.clients({ archived: true }),
    queryFn: () => api.clients({ includeArchived: true }),
  });

  return useMemo(
    () =>
      new Map(
        (clients.data?.clients ?? []).map((c) => [
          c.id,
          { id: c.id, name: c.name, color: c.color },
        ]),
      ),
    [clients.data],
  );
}
