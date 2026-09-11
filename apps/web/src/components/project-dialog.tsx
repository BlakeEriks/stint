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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from './color-picker';
import { api, ApiError, type Project, type ProjectInput } from '@/lib/client/api';

/**
 * A dialog rather than a page: a project is four fields, and it is created
 * mid-flow — from the picker while starting a timer — so leaving the screen
 * would lose what the user was doing.
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
  const [color, setColor] = useState<string | null>(null);
  const [billable, setBillable] = useState(true);

  // Reset each time it opens, so a cancelled edit does not leak into the
  // next one.
  useEffect(() => {
    if (!open) return;
    setName(existing?.name ?? '');
    setClientId(existing?.clientId ?? defaultClientId ?? null);
    setHourlyRate(
      existing?.hourlyRate != null ? String(existing.hourlyRate) : '',
    );
    setColor(existing?.color ?? null);
    setBillable(existing?.isBillableDefault ?? true);
  }, [open, existing, defaultClientId]);

  const { data: clientData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.clients(),
    enabled: open,
  });
  const clients = clientData?.clients ?? [];

  const save = useMutation({
    mutationFn: (body: ProjectInput) =>
      existing ? api.updateProject(existing.id, body) : api.createProject(body),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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
      color,
      isBillableDefault: billable,
    });
  };

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
            <select
              id="project-client"
              value={clientId ?? ''}
              onChange={(e) => setClientId(e.target.value || null)}
              className="h-9 rounded-md border border-edge-default bg-transparent px-3
                         text-[14px] text-strong outline-none
                         focus-visible:border-edge-focus focus-visible:ring-[3px]
                         focus-visible:ring-edge-focus"
            >
              <option value="">No client — internal work</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
              placeholder="Falls back to the client's rate"
            />
          </div>

          <ColorPicker value={color} onChange={setColor} />

          <label className="flex items-center gap-2.5 text-[14px] text-primary">
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
            <p role="alert" className="text-[13px] text-danger">
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
            <Button type="submit" disabled={save.isPending || name.trim() === ''}>
              {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Add project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-subtle';
