'use client';

import { addDays, type Period } from '@stint/core';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Field, inputClass } from './field';
import { shortDate } from './invoice-bits';

/** The first and last day of the month `offset` months from `today`'s. */
function month(today: string, offset: number): Period {
  const [y = 0, m = 1] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const start = first.toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + offset, 0)).toISOString().slice(0, 10);
  return { periodStart: start, periodEnd: end };
}

/** The periods a contractor bills most, each counted back from `today`.
    Two weeks are the fourteen days before today, which today's work has not
    finished. */
function presets(today: string): { name: string; period: Period }[] {
  return [
    { name: 'Last month', period: month(today, -1) },
    { name: 'This month', period: month(today, 0) },
    {
      name: 'Last two weeks',
      period: {
        periodStart: addDays(today, -14),
        periodEnd: addDays(today, -1),
      },
    },
  ];
}

/** "Oct 1 – Oct 31, 2026": the year once when both ends share it. */
function rangeText({ periodStart, periodEnd }: Period) {
  const end = shortDate(periodEnd);
  if (periodStart.slice(0, 4) !== periodEnd.slice(0, 4))
    return `${shortDate(periodStart)} – ${end}`;
  return `${shortDate(periodStart).replace(/, \d+$/, '')} – ${end}`;
}

/**
 * The invoice's period: one control showing the range and the preset it
 * matches, opening the presets and the two dates. Either date, or a preset,
 * sets both, so another client's schedule can't move the other end under
 * the user.
 */
export function PeriodPicker({
  id,
  value,
  today,
  onChange,
}: {
  id: string;
  value: Period;
  today: string;
  onChange: (period: Period) => void;
}) {
  const choices = presets(today);
  const chosen = choices.find(
    (p) =>
      p.period.periodStart === value.periodStart &&
      p.period.periodEnd === value.periodEnd,
  );
  // A cleared date is still being typed, not a period.
  const complete = value.periodStart !== '' && value.periodEnd !== '';
  return (
    <Popover>
      <PopoverTrigger
        id={id}
        className={`${inputClass} flex items-center justify-between gap-2 text-left
                    focus:border-edge-focus focus:ring-[3px] focus:ring-edge-focus`}
      >
        <span className="truncate">
          {complete ? rangeText(value) : 'Choose dates'}
          {chosen ? (
            <span className="text-subtle"> · {chosen.name}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 flex-none text-muted opacity-60"
          strokeWidth={2}
        />
      </PopoverTrigger>
      <PopoverContent
        aria-label="Period"
        align="start"
        className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-4"
      >
        <div className="flex flex-wrap gap-1.5">
          {choices.map((p) => (
            <Button
              key={p.name}
              type="button"
              size="sm"
              variant={p === chosen ? 'default' : 'ghost'}
              aria-pressed={p === chosen}
              onClick={() => onChange(p.period)}
            >
              {p.name}
            </Button>
          ))}
        </div>
        <div className="flex gap-3">
          <DateField
            id="inv-from"
            label="From"
            value={value.periodStart}
            onChange={(v) => onChange({ ...value, periodStart: v })}
          />
          <DateField
            id="inv-to"
            label="To"
            value={value.periodEnd}
            onChange={(v) => onChange({ ...value, periodEnd: v })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id} className="min-w-0 flex-1">
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // A date input keeps an intrinsic width that would wrap the row.
        className="min-w-0"
      />
    </Field>
  );
}
