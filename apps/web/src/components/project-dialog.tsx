'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  ApiError,
  type Project,
  type ProjectInput,
} from '@/lib/client/api';
import { ClientForm } from './client-form';
import { ClientPicker } from './client-picker';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

/**
 * A dialog rather than a page: a project is four fields, and it is created
 * mid-flow — from the picker while starting a timer — so leaving the screen
 * would lose what the user was doing.
 *
 * It can also create the client, so a new account can attach its first
 * project to something without leaving for `/clients`.
 *
 * The client form REPLACES this dialog's content rather than opening a second
 * dialog on top of it: stacked dialogs mean two overlays and two focus traps
 * competing. The project fields live in component state, so they survive the
 * detour and are still there on return.
 */
export function ProjectDialog({
  open,
  onOpenChange,
  existing,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: Project;
  defaultClientId?: string | null;
  onSaved?: (project: Project) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [hourlyRate, setHourlyRate] = useState('');
  const [billable, setBillable] = useState(true);
  const [addingClient, setAddingClient] = useState(false);

  // Reset each time it opens, so a canceled edit does not leak into the
  // next one.
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setClientId(existing?.clientId ?? defaultClientId ?? null);
    setHourlyRate(
      existing?.hourlyRate != null ? String(existing.hourlyRate) : '',
    );
    setBillable(existing?.isBillableDefault ?? true);
    // Reopening must never land on the client form — it is a detour, not a
    // state the dialog can be left in.
    setAddingClient(false);
  }, [open, existing, defaultClientId]);

  const { data: clientData } = useQuery({
    queryKey: keys.clients(),
    queryFn: () => api.clients(),
    enabled: open,
  });
  const clients = clientData?.clients ?? [];

  const save = useMutation({
    mutationFn: (body: ProjectInput) =>
      existing ? api.updateProject(existing.id, body) : api.createProject(body),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: keys.projects() });
      // A project's rate is what its unbilled work is valued at, in every rollup.
      invalidateEntryData(queryClient);
      onSaved?.(saved);
      onOpenChange(false);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      clientId,
      hourlyRate: hourlyRate.trim() === '' ? null : Number(hourlyRate),
      isBillableDefault: billable,
    });
  };

  if (addingClient) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>
              It will be selected for this project once saved.
            </DialogDescription>
          </DialogHeader>

          {/* The same form the page uses, so the field set and validation
              cannot drift. Saving selects the new client and comes straight
              back to the project; canceling abandons only the client. */}
          <ClientForm
            onSaved={(client) => {
              setClientId(client.id);
              setAddingClient(false);
            }}
            onCancel={() => setAddingClient(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            Projects group time entries and set the rate they bill at.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name" className={LABEL}>
              Name
            </Label>
            <Input
              id="project-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Website redesign"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-client" className={LABEL}>
              Client
            </Label>
            <ClientPicker
              id="project-client"
              clients={clients}
              value={clientId}
              onChange={setClientId}
              onAdd={() => setAddingClient(true)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-rate" className={LABEL}>
              Hourly rate
            </Label>
            <Input
              id="project-rate"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="Defaults to the client's rate"
            />
          </div>

          <label className="flex items-center gap-2.5 type-control text-primary">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              /* Neutral, not the accent: the dialog's one accent is its
                 submit button, and a checked box is state, not the primary
                 action. */
              className="size-4 accent-[var(--text-muted)]"
            />
            Billable by default
          </label>

          {save.error ? (
            <p role="alert" className="type-support text-danger">
              {save.error instanceof ApiError
                ? save.error.message
                : 'Could not save this project.'}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            {/* Icon plus label, like every other action in the app. The
                glyph is `aria-hidden`, so the accessible name is the label
                alone. */}
            <Button
              type="submit"
              variant="accent"
              disabled={save.isPending || name.trim() === ''}
            >
              {save.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : existing ? (
                <Check aria-hidden />
              ) : (
                <Plus aria-hidden />
              )}
              {save.isPending
                ? 'Saving…'
                : existing
                  ? 'Save changes'
                  : 'Add project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LABEL = 'type-label text-subtle';
