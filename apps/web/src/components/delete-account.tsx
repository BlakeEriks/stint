'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Section } from './field';
import { api } from '@/lib/client/api';
import { keys } from '@/lib/client/query-keys';
import { browserClient } from '@/lib/client/supabase';
import { useAccount } from '@/lib/client/use-account';

/**
 * The account, and the way out of it for good.
 *
 * Typing the email back is the gate: it cannot be clicked through by habit,
 * and it names which account for someone signed in to more than one.
 */
export function DeleteAccount() {
  const { email } = useAccount();
  const [open, setOpen] = useState(false);

  return (
    <Section
      title="Account"
      description={email ? `Signed in as ${email}.` : undefined}
    >
      <div>
        <Button
          variant="ghost"
          className="-ml-4 text-danger hover:bg-danger-muted hover:text-danger"
          disabled={!email}
          onClick={() => setOpen(true)}
        >
          Delete account
        </Button>
      </div>
      {email ? (
        <DeleteAccountDialog open={open} onOpenChange={setOpen} email={email} />
      ) : null}
    </Section>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const [typed, setTyped] = useState('');

  const { data: counts } = useQuery({
    queryKey: keys.account(),
    queryFn: api.account,
    enabled: open,
  });

  const remove = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: async () => {
      // The auth user is gone, but this browser's JWT still verifies until it
      // expires, so /signin would send it home. Clear it here first.
      await browserClient().auth.signOut({ scope: 'local' });
      window.location.assign('/signin?deleted=1');
    },
  });

  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  const busy = remove.isPending || remove.isSuccess;

  // Nothing typed survives a close, so reopening always starts at the gate.
  const close = () => {
    if (busy) return;
    setTyped('');
    remove.reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            Everything below is deleted now and cannot be recovered from the
            app.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (matches && !busy) remove.mutate();
          }}
        >
          <ul className="flex flex-wrap gap-x-4 gap-y-1 type-amount text-strong">
            {counts ? (
              (
                [
                  ['entries', counts.entries],
                  ['clients', counts.clients],
                  ['projects', counts.projects],
                  ['invoices', counts.invoices],
                ] as const
              ).map(([label, n]) => (
                <li key={label}>
                  {n.toLocaleString('en-US')}{' '}
                  <span className="text-subtle">{label}</span>
                </li>
              ))
            ) : (
              <li className="text-subtle">Counting…</li>
            )}
          </ul>

          <p className="type-support text-muted">
            Invoices you have sent are tax records. Download the PDFs you need
            before you go. Backups keep a copy for 90 days, then it is gone.
          </p>

          <Field label="Type your email to confirm" htmlFor="delete-confirm">
            <Input
              id="delete-confirm"
              autoComplete="off"
              spellCheck={false}
              placeholder={email}
              value={typed}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>

          {remove.isError ? (
            <p role="alert" className="type-support text-danger">
              Not deleted — nothing was removed. Try again.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!matches || busy}
            >
              {busy ? 'Deleting…' : 'Delete account and data'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
