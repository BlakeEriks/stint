'use client';

import { useOptimisticMutation } from '@stint/client';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { browserClient } from '@/lib/client/supabase';

/**
 * Approving an app such as Claude, from Supabase's OAuth server
 * (`/oauth/consent`). Supabase then sends the browser to the app's callback,
 * which for Claude Code is a localhost server that doesn't leave this page,
 * so an answered press says it's done.
 */
export function ConsentForm({
  authorizationId,
  app,
  email,
}: {
  authorizationId: string;
  /** The app's name, or null when the link can't be used. */
  app: string | null;
  email: string;
}) {
  // Pending, not predicted: the server decides, and it can't be taken back.
  const answer = useOptimisticMutation<'approve' | 'deny'>({
    queryKey: () => ['oauth-consent', authorizationId],
    inline: true,
    mutationFn: async (choice) => {
      const { oauth } = browserClient().auth;
      const { error } =
        choice === 'approve'
          ? await oauth.approveAuthorization(authorizationId)
          : await oauth.denyAuthorization(authorizationId);
      if (error) throw new Error(error.message);
    },
  });
  const pressed = answer.isPending ? answer.variables : null;
  const done = answer.isSuccess ? answer.variables : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1>
        <Wordmark />
      </h1>

      {app === null ? (
        <p
          role="alert"
          className="mt-8 rounded-lg border border-edge-subtle bg-surface-base p-3 type-support text-danger"
        >
          This link can’t be used. It may have expired. Connect again from the
          app.
        </p>
      ) : (
        <>
          <h2 className="mt-8 type-title text-strong">Connect {app}?</h2>
          <p className="mt-2 type-support text-muted">
            {app} will read your clients, projects and time entries, add clients
            and projects, edit your clients, and rename projects and tasks.
            Revoke it any time in Settings.
          </p>
          <p className="mt-2 type-meta text-subtle">Signed in as {email}</p>

          {done ? (
            <p role="status" className="mt-6 type-support text-strong">
              {done === 'approve' ? 'Connected.' : 'Not connected.'} You can
              close this tab.
            </p>
          ) : (
            <div className="mt-6 flex gap-2">
              <Button
                type="button"
                variant="accent"
                disabled={answer.isPending}
                onClick={() => answer.mutate('approve')}
              >
                {pressed === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                type="button"
                disabled={answer.isPending}
                onClick={() => answer.mutate('deny')}
              >
                {pressed === 'deny' ? 'Denying…' : 'Deny'}
              </Button>
            </div>
          )}

          {answer.error ? (
            <p role="alert" className="mt-3 type-support text-danger">
              {answer.error.message}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
