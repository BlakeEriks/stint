'use client';

import { buildEarnedPace, businessDayKeysInLocalMonth } from '@stint/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Month } from '@/components/home-month';
import { type Hue, Legend } from '@/components/home-shell';

const TZ = 'America/New_York';

/** Money per business day worked, so the climb has a believable shape. */
const DAILY = [
  1312.5, 875, 1487.5, 0, 1050, 1225, 700, 1400, 962.5, 1137.5, 1312.5, 525,
];

const NORTHWIND = '00000000-0000-7000-8000-000000000001';
const HARBOUR = '00000000-0000-7000-8000-000000000002';

const hues = new Map<string, Hue>([
  [NORTHWIND, { id: NORTHWIND, name: 'Northwind Trading', color: '#6EA1E2' }],
  [HARBOUR, { id: HARBOUR, name: 'Harbour & Co.', color: '#D38B59' }],
]);

/**
 * Home's month region, drawn by the app's own component from sample figures,
 * so the landing page and the product cannot disagree about the chart.
 *
 * Today is pinned to the current month's twelfth business day: early in a
 * real month there is no projection to show.
 */
export function DemoMonth() {
  const days = businessDayKeysInLocalMonth(new Date(), TZ);
  const today = days[DAILY.length - 1] as string;
  const byDay = new Map(
    days.slice(0, DAILY.length).map((d, i) => [d, DAILY[i] as number]),
  );
  const pace = buildEarnedPace({
    byDay,
    now: new Date(`${today}T17:00:00Z`),
    tz: TZ,
  });
  const earned = pace.earned;
  /* Money's count-up remembers each figure on a query client. */
  const [client] = useState(() => new QueryClient());

  return (
    /* The projection's endpoint pulses, as the hero's running timer does. */
    <QueryClientProvider client={client}>
      <div className="@container motion-safe:[&_[data-projection=end]]:animate-pulse">
        <Month
          stats={{
            currency: 'USD',
            month: {
              ...pace,
              byClient: [
                {
                  clientId: NORTHWIND,
                  clientName: 'Northwind Trading',
                  amount: earned * 0.6,
                },
                {
                  clientId: HARBOUR,
                  clientName: 'Harbour & Co.',
                  amount: earned * 0.4,
                },
              ],
            },
            unbilled: {
              total: 4812.5,
              mixed: false,
              seconds: 0,
              byClient: [],
              moreClients: 0,
            },
            awaitingPayment: 0,
            openInvoiceCount: 0,
          }}
          hues={hues}
        />
        <Legend hues={hues} />
      </div>
    </QueryClientProvider>
  );
}
