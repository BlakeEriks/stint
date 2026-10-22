'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, type Settings } from '@/lib/client/api';
import { useOptimisticMutation } from '@/lib/client/mutations';
import { keys, invalidateEntryData } from '@/lib/client/query-keys';
import { useSaveClient } from './client-form';
import { ColorPicker } from './color-picker';
import { Field } from './field';
import { RateInput, isValidRate, parseRate } from './rate-input';
import { StepDialog } from './step-dialog';

/**
 * A first sign-in's two questions: the default rate, then a first client.
 *
 * Open while `welcomedAt` is null. Every way out stamps it, so it shows once
 * per account, on any device.
 */
export function WelcomeDialog() {
  const router = useRouter();
  const { data: settings } = useQuery({
    queryKey: keys.settings(),
    queryFn: api.settings,
  });
  const [step, setStep] = useState<1 | 2>(1);
  const [rateText, setRateText] = useState('');
  const [name, setName] = useState('');
  const [clientRate, setClientRate] = useState('');
  const [color, setColor] = useState<string | null>(null);

  const patchSettings =
    (patch: Partial<Settings>) => (current: Settings | undefined) =>
      current ? { ...current, ...patch } : current;

  /* The rate is saved on Next, so closing the tab on step 2 keeps it. */
  const saveRate = useOptimisticMutation({
    queryKey: () => keys.settings(),
    mutationFn: (defaultHourlyRate: number) =>
      api.updateSettings({ defaultHourlyRate }),
    predict: (current: Settings | undefined, defaultHourlyRate) =>
      patchSettings({ defaultHourlyRate })(current),
    invalidate: (qc) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.settings() }),
        invalidateEntryData(qc),
      ]),
  });

  /* Predicted, so the dialog closes on the press; a refusal brings it back. */
  const welcome = useOptimisticMutation({
    queryKey: () => keys.settings(),
    mutationFn: (welcomedAt: string) => api.updateSettings({ welcomedAt }),
    predict: (current: Settings | undefined, welcomedAt) =>
      patchSettings({ welcomedAt })(current),
  });
  const done = () => welcome.mutate(new Date().toISOString());

  const createClient = useSaveClient(undefined, done);

  const rate = parseRate(rateText);
  const defaultRate = settings?.defaultHourlyRate ?? null;
  const ownRate = parseRate(clientRate);
  const saving = createClient.isPending;

  return (
    <StepDialog open={settings?.welcomedAt === null} step={step} steps={2}>
      {step === 1 ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidRate(rate)) return;
            saveRate.mutate(rate);
            setStep(2);
          }}
        >
          <DialogHeader>
            <DialogTitle>Welcome to Stint</DialogTitle>
            <DialogDescription>
              What do you charge by the hour?
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Default hourly rate"
            htmlFor="welcome-rate"
            hint="A client or project can set its own rate later."
          >
            <RateInput
              id="welcome-rate"
              large
              unit="/ hour"
              autoFocus
              placeholder="100.00"
              value={rateText}
              onChange={(e) => setRateText(e.target.value)}
              aria-invalid={
                rateText !== '' && !isValidRate(rate) ? true : undefined
              }
            />
          </Field>
          <DialogFooter className="items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={done}>
              Skip for now
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={!isValidRate(rate)}
            >
              Next
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              name.trim() === '' ||
              (ownRate !== null && !isValidRate(ownRate))
            )
              return;
            createClient.mutate({
              name: name.trim(),
              hourlyRate: ownRate,
              color,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Who are you working for?</DialogTitle>
            <DialogDescription>
              Add your first client now, or later from Clients.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Field label="Client name" htmlFor="welcome-client">
              <Input
                id="welcome-client"
                autoFocus
                placeholder="Northwind Trading"
                value={name}
                readOnly={saving}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field
              label="Rate"
              htmlFor="welcome-client-rate"
              hint="Blank uses your default"
            >
              <RateInput
                id="welcome-client-rate"
                placeholder={
                  isValidRate(defaultRate) ? defaultRate.toFixed(2) : '100.00'
                }
                value={clientRate}
                readOnly={saving}
                onChange={(e) => setClientRate(e.target.value)}
              />
            </Field>
          </div>
          <ColorPicker value={color} onChange={setColor} />
          <p className="type-support text-muted">
            Coming from Toggl?{' '}
            <a
              href="/settings/import"
              className="text-primary underline"
              onClick={(e) => {
                e.preventDefault();
                done();
                router.push('/settings/import');
              }}
            >
              Import your history
            </a>{' '}
            instead.
          </p>
          {createClient.error ? (
            <p role="alert" className="type-support text-danger">
              {createClient.error.message}
            </p>
          ) : null}
          <DialogFooter className="items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setStep(1)}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {name.trim() === '' ? (
                <Button type="button" onClick={done}>
                  Skip this step
                </Button>
              ) : null}
              <Button
                type="submit"
                variant="accent"
                disabled={name.trim() === '' || saving}
              >
                {saving ? (
                  <>
                    <Loader2 aria-hidden className="animate-spin" />
                    Saving
                  </>
                ) : (
                  'Start tracking'
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      )}
    </StepDialog>
  );
}
