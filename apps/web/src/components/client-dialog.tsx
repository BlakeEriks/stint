'use client';

import { Archive } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, type Client } from '@/lib/client/api';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { ClientForm } from './client-form';
import {
  keys,
  invalidateEntryData,
  predictArchive,
} from '@/lib/client/query-keys';

/**
 * Edits a client where the contractor already is, as `ProjectDialog` does a
 * project, so editing reads the same from any screen. The form is the one
 * the page uses, so the field set cannot drift.
 *
 * Archive sits here rather than on the list: it is rare. Archive, never
 * delete: invoices reference the client.
 */
export function ClientDialog({
  open,
  onOpenChange,
  client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
}) {
  /* Predicted: the dialog closes and the client goes on the press; a
     refusal puts it back and the notice says why. */
  const archive = useOptimisticMutation<string, unknown, unknown>({
    queryKey: () => keys.clients(),
    mutationFn: (id) => api.archiveClient(id),
    predict: (current, id, key) => predictArchive('clients', id, current, key),
    // Archiving withdraws the client's rate from every rollup.
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.clients() }),
        invalidateEntryData(qc),
      ]),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            Its rate is what its projects bill at unless they set their own.
          </DialogDescription>
        </DialogHeader>

        {/* Keyed by client so reopening on another one starts from its
            values, not the last one's. */}
        <ClientForm
          key={client.id}
          existing={client}
          onSaved={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          footer={
            client.archivedAt ? null : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  archive.mutate(client.id);
                  onOpenChange(false);
                }}
              >
                <Archive aria-hidden strokeWidth={1.75} />
                Archive
              </Button>
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
