'use client';

import { Combobox } from '@/components/ui/combobox';

/** `America/Los_Angeles` as `America/Los Angeles`. */
const zoneLabel = (zone: string) => zone.replaceAll('_', ' ');

const ZONES = Intl.supportedValuesOf('timeZone').map((z) => ({
  value: z,
  label: zoneLabel(z),
}));

/** A billing time zone, by IANA name, or `unset`, which saves null. */
export function ZoneSelect({
  id,
  value,
  onChange,
  unset,
}: {
  id: string;
  value: string | null;
  onChange: (zone: string | null) => void;
  unset: string;
}) {
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      options={ZONES}
      unset={unset}
      searchLabel="Search time zones"
    />
  );
}
