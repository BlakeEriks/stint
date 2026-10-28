'use client';

import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, type SettingsInput } from '@/lib/client/api';
import { useOptimisticMutation, keys } from '@stint/client';

/**
 * A few Settings fields asked where they are needed, so the user never
 * leaves the screen for them. What is saved is Settings, for every screen
 * after. `children` gets whether the save is pending, to hold its fields.
 */
export function SettingsDialog({
  onOpenChange,
  title,
  description,
  ready,
  patch,
  children,
}: {
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  ready: boolean;
  patch: () => SettingsInput;
  children: (pending: boolean) => ReactNode;
}) {
  const queryClient = useQueryClient();

  /* Pending: the server validates, and the dialog stays open to say what it
     refused. */
  const save = useOptimisticMutation({
    queryKey: () => keys.settings(),
    inline: true,
    mutationFn: () => api.updateSettings(patch()),
    /* The answer is the saved settings, so the screen takes it as the
       dialog closes rather than a refetch later. */
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.settings(), saved);
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open
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
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children(save.isPending)}
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
