'use client';

import { useState } from 'react';
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
  const [pressed, setPressed] = useState<'approve' | 'deny' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState<'approve' | 'deny' | null>(null);

  async function answer(choice: 'approve' | 'deny') {
    setPressed(choice);
    setFailed(null);
    const { oauth } = browserClient().auth;
    const { error } =
      choice === 'approve'
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setPressed(null);
      setFailed(error.message);
    } else setDone(choice);
  }

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
                disabled={pressed !== null}
                onClick={() => answer('approve')}
              >
                {pressed === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                type="button"
                disabled={pressed !== null}
                onClick={() => answer('deny')}
              >
                {pressed === 'deny' ? 'Denying…' : 'Deny'}
              </Button>
            </div>
          )}

          {failed ? (
            <p role="alert" className="mt-3 type-support text-danger">
              {failed}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
