'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, type Settings } from '@/lib/client/api';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { keys } from '@/lib/client/query-keys';
import { Field } from './field';

/**
 * Whether the invoice has no sender yet. The server refuses to generate one
 * without a business name and email; New invoice asks before that.
 */
export const missingBusiness = (s: Settings | undefined) =>
  s !== undefined && (!s.businessName?.trim() || !s.businessEmail?.trim());

/**
 * Who the invoice is from, asked on New invoice rather than sending the
 * user to Settings. What is saved here is Settings, for every invoice after.
 */
export function BusinessDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
}) {
  const [name, setName] = useState(settings.businessName ?? '');
  const [email, setEmail] = useState(settings.businessEmail ?? '');
  const [address, setAddress] = useState(settings.businessAddress ?? '');
  const queryClient = useQueryClient();

  /* Pending: the server validates the email, and the dialog stays open to
     say what it refused. */
  const save = useOptimisticMutation({
    queryKey: () => keys.settings(),
    inline: true,
    mutationFn: () =>
      api.updateSettings({
        businessName: name.trim(),
        businessEmail: email.trim(),
        businessAddress: address.trim() || null,
      }),
    /* The answer is the saved settings, so the notice and the preview take
       it as the dialog closes rather than a refetch later. */
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.settings(), saved);
      onOpenChange(false);
    },
  });
  const ready = name.trim() !== '' && email.trim() !== '';

  return (
    <Dialog
      open={open}
      // Closed while it waits, a refusal would show nowhere: it is inline.
      onOpenChange={(next) => save.isPending || onOpenChange(next)}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Who is this invoice from?</DialogTitle>
            <DialogDescription>
              Your name and email go at the top of every invoice. Saved to
              Settings, so you're asked once.
            </DialogDescription>
          </DialogHeader>
          <Field label="Business name" htmlFor="biz-dialog-name" required>
            <Input
              id="biz-dialog-name"
              autoFocus
              placeholder="Sam Rivera Consulting"
              value={name}
              readOnly={save.isPending}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="biz-dialog-email" required>
            <Input
              id="biz-dialog-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              readOnly={save.isPending}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Address" htmlFor="biz-dialog-address">
            <Input
              id="biz-dialog-address"
              placeholder="Street, city, state ZIP"
              value={address}
              readOnly={save.isPending}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          {save.error ? (
            <p role="alert" className="type-support text-danger">
              {save.error.message}
            </p>
          ) : null}
          <DialogFooter className="items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={!ready || save.isPending}
            >
              {save.isPending ? (
                <>
                  <Loader2 aria-hidden className="animate-spin" />
                  Saving
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
