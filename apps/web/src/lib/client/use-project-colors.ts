'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

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
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  });
  const clients = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients(),
  });

  const byClient = new Map(
    (clients.data?.clients ?? []).map((c) => [c.id, c.color ?? null]),
  );

  return new Map(
    (projects.data?.projects ?? []).map((p) => [
      p.id,
      p.clientId ? (byClient.get(p.clientId) ?? null) : null,
    ]),
  );
}
