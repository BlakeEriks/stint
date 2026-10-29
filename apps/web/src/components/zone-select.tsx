'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inputClass } from './field';

/** Radix reserves the empty string, so null travels as this. */
const UNSET = 'unset';

const ZONES = Intl.supportedValuesOf('timeZone');

/** `America/Los_Angeles` as `America/Los Angeles`. */
export const zoneLabel = (zone: string) => zone.replaceAll('_', ' ');

/**
 * A billing time zone, by IANA name, or the fallback `unset` names. Typing a
 * city's first letters moves to it, so the long list needs no search.
 */
export function ZoneSelect({
  id,
  value,
  onChange,
  unset,
}: {
  id: string;
  value: string | null;
  onChange: (zone: string | null) => void;
  /** The first item, which saves null: what a null zone falls back to. */
  unset: string;
}) {
  // A saved zone this browser doesn't list still shows as itself.
  const zones = value && !ZONES.includes(value) ? [value, ...ZONES] : ZONES;
  return (
    <Select
      value={value ?? UNSET}
      onValueChange={(v) => onChange(v === UNSET ? null : v)}
    >
      <SelectTrigger id={id} className={inputClass}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>{unset}</SelectItem>
        {zones.map((z) => (
          <SelectItem key={z} value={z}>
            {zoneLabel(z)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
