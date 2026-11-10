'use client';

import { useQuery } from '@tanstack/react-query';
import { keys, useOptimisticMutation } from '@stint/client';
import { localDateKey } from '@stint/core';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client/api';
import { timeZone } from '@/lib/client/use-timer';
import { Section } from './field';
import { shortDate } from './invoice-bits';

/** Apps approved at `/oauth/consent`, such as Claude, and the way to cut one off. */
export function ConnectedApps() {
  const { data } = useQuery({
    queryKey: keys.connectedApps(),
    queryFn: api.connectedApps,
  });
  const apps = data?.apps ?? [];

  // Pending, not predicted: a revoke can't be taken back (Constitution VI).
  const revoke = useOptimisticMutation<string>({
    queryKey: () => keys.connectedApps(),
    mutationFn: (clientId) =>
      api.revokeConnectedApp(clientId).catch((e: Error) => {
        const name =
          apps.find((a) => a.clientId === clientId)?.name ?? 'that app';
        throw new Error(`Couldn’t revoke ${name}. ${e.message}`);
      }),
  });

  // Unloaded only when the list failed: the section stays out, not empty.
  if (!data) return null;

  return (
    <Section
      title="Connected apps"
      description="Apps you approved to read your clients, projects and entries, add and edit clients, add projects, and rename projects and tasks."
    >
      {apps.length === 0 ? (
        <p className="type-support text-subtle">
          None. To connect Claude, add Stint’s MCP server to it:{' '}
          <code className="type-meta">
            {`${window.location.origin}/api/mcp`}
          </code>
        </p>
      ) : (
        <ul className="divide-y divide-edge-subtle">
          {apps.map((app) => (
            <li key={app.clientId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate type-control text-primary">{app.name}</p>
                <p className="mt-0.5 type-meta text-subtle">
                  Approved{' '}
                  {shortDate(localDateKey(new Date(app.grantedAt), timeZone))}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(app.clientId)}
              >
                {revoke.isPending && revoke.variables === app.clientId
                  ? 'Revoking…'
                  : 'Revoke'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
