'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client/api';
import { useTimer } from '@/lib/client/use-timer';
import { TimerBar } from './timer-bar';
import { EntryList } from './entry-list';
import { HomeCards } from './home-cards';
import { Page } from './page';

/**
 * Timer hero, cards, then today's entries.
 *
 * The hero and the entry list are FIXED — they are why the screen is opened
 * fifty times a day, and the cards are what you scroll past to reach them.
 * The card order is money at risk, money waiting, money coming; everything
 * between the hero and the list should be readable in about three seconds.
 */
export function Home() {
  const timer = useTimer();
  const { data } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects(),
  });
  const projects = data?.projects ?? [];

  return (
    <Page>
      <TimerBar projects={projects} />
      <HomeCards />
      <EntryList projects={projects} todaySeconds={timer.todaySeconds} />
    </Page>
  );
}
