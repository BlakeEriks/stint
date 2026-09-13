'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { useTimer } from '@/lib/client/use-timer';
import { EntryList } from './entry-list';
import { HomeCards } from './home-cards';
import { Page } from './page';

/**
 * The cards, then today's entries.
 *
 * The timer hero used to open this screen and no longer does: it is docked to
 * the frame now (`timer-dock.tsx`), visible from every route. That returned
 * the top 87px of the page — the band the eye lands on first — to the money
 * cards, which is where it should have been.
 *
 * The card order is money waiting, then money coming, then texture; the whole
 * screen should be readable in about three seconds. Money *at risk* is not
 * here either — it moved to the inbox in the dock.
 *
 * `wide`, because the cards became a grid at `lg`. At the old `max-w-3xl` a
 * 1600px window left 312px empty on each side — 624px of dead space, nearly
 * as wide as the content — and the cards stacked because the column was
 * prose-width, not because stacking was chosen.
 */
export function Home() {
  const timer = useTimer();
  const { data } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  });
  const projects = data?.projects ?? [];

  return (
    <Page wide>
      <HomeCards />
      <EntryList projects={projects} todaySeconds={timer.todaySeconds} />
    </Page>
  );
}
