'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from './color-picker';
import { Field } from './field';
import { api, ApiError, type Client, type ClientInput } from '@/lib/client/api';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';

/**
 * Create and edit are the same form — the only difference is which request
 * it issues, so they cannot drift in validation or field set.
 *
 * Rate and tax are optional: a client with no rate falls back to the user
 * default, and a US contractor invoicing services usually owes no tax at all.
 *
 * What happens AFTER a save is injected, because the form renders both as a
 * page and inside a dialog (created mid-flow from the project dialog). The
 * page navigates to the new client; the dialog hands it back to the select
 * that asked for it and stays where it was. Hardcoding `router.push` here
 * would have meant a second copy of the field set, which is the drift this
 * component exists to prevent.
 */
export function ClientForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing?: Client;
  onSaved?: (client: Client) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [hourlyRate, setHourlyRate] = useState(
    existing?.hourlyRate != null ? String(existing.hourlyRate) : '',
  );
  const [taxRate, setTaxRate] = useState(
    existing?.taxRate != null ? String(existing.taxRate) : '',
  );
  const [color, setColor] = useState<string | null>(existing?.color ?? null);

  const save = useMutation({
    mutationFn: (body: ClientInput) =>
      existing ? api.updateClient(existing.id, body) : api.createClient(body),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: keys.clients() });
      /* The client's rate is what unbilled work is valued at — and every
         other rollup reads the same entries through the same rate chain, so
         refreshing `stats` alone leaves the heatmap and the activity list
         disagreeing with the figure above them. */
      invalidateEntryData(queryClient);
      if (onSaved) onSaved(saved);
      else router.push(`/clients/${saved.id}`);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate({
      name: name.trim(),
      // Empty is "unset", not empty string — the column is nullable and the
      // schema rejects a blank email.
      email: email.trim() || null,
      address: address.trim() || null,
      hourlyRate: hourlyRate.trim() === '' ? null : Number(hourlyRate),
      taxRate: taxRate.trim() === '' ? null : Number(taxRate),
      color,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="Name" htmlFor="client-name" required>
        <Input
          id="client-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Corp"
        />
      </Field>

      <Field label="Email" htmlFor="client-email">
        <Input
          id="client-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="billing@acme.com"
        />
      </Field>

      <Field
        label="Address"
        htmlFor="client-address"
        hint="Appears on the invoice."
      >
        <textarea
          id="client-address"
          rows={3}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={'123 Main St\nAustin, TX 78701'}
          className="w-full rounded-md border border-edge-default bg-transparent px-3 py-2
                     type-control text-strong placeholder:text-subtle outline-none
                     focus-visible:border-edge-focus focus-visible:ring-[3px]
                     focus-visible:ring-edge-focus"
        />
      </Field>

      <div className="flex flex-wrap gap-4">
        <Field
          label="Hourly rate"
          htmlFor="client-rate"
          hint="Defaults to your standard rate."
          className="flex-1 basis-40"
        >
          <Input
            id="client-rate"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="150.00"
          />
        </Field>

        <Field
          label="Tax rate %"
          htmlFor="client-tax"
          hint="Usually none for US services."
          className="flex-1 basis-40"
        >
          <Input
            id="client-tax"
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            placeholder="0"
          />
        </Field>
      </div>

      <ColorPicker value={color} onChange={setColor} />

      {save.error ? (
        <p role="alert" className="type-support text-danger">
          {save.error instanceof ApiError
            ? save.error.message
            : 'Could not save this client.'}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={save.isPending || name.trim() === ''}>
          {save.isPending ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Check aria-hidden />
          )}
          {save.isPending
            ? 'Saving…'
            : existing
              ? 'Save changes'
              : 'Add client'}
        </Button>
        {/* No icon: Cancel undoes the intent rather than performing one, and
            a glyph would give a dismissal the same weight as the save it
            sits beside. */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => (onCancel ? onCancel() : router.back())}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
