/** A client with time in view, as the calendar's legend names it. */
export interface LegendClient {
  id: string;
  name: string;
  color: string | null;
  seconds: number;
}

/**
 * Which clients the entries in view belong to, ranked by tracked time, and
 * whether any time had no client.
 *
 * Built from the entries rather than the client list, so it never names a
 * client with nothing on screen. A running entry (`durationSeconds` null)
 * counts 0 but still names its client: its block is on the grid. A client
 * with no color is still a client, not "No client".
 */
export function legendClients(
  entries: { projectId: string | null; durationSeconds: number | null }[],
  clientByProject: Map<
    string,
    { id: string; name: string; color: string | null }
  >,
): { clients: LegendClient[]; noClient: boolean } {
  const byId = new Map<string, LegendClient>();
  let noClientSeconds = 0;

  for (const { projectId, durationSeconds } of entries) {
    const seconds = durationSeconds ?? 0;
    const client = projectId ? clientByProject.get(projectId) : undefined;
    if (!client) {
      noClientSeconds += seconds;
      continue;
    }
    const tally = byId.get(client.id) ?? { ...client, seconds: 0 };
    tally.seconds += seconds;
    byId.set(client.id, tally);
  }

  return {
    clients: [...byId.values()].sort((a, b) => b.seconds - a.seconds),
    noClient: noClientSeconds > 0,
  };
}
