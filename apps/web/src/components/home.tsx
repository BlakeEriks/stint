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
 *
 * `wide`, because the cards became a grid at `lg`. At the old `max-w-3xl` a
 * 1600px window left 312px empty on each side — 624px of dead space, nearly
 * as wide as the content — and the cards stacked because the column was
 * prose-width, not because stacking was chosen.
 *
 * The hero and the entry list stay full-width inside that wider column while
 * the cards split. They are the fixed points of the screen, and putting
 * either into a column is the change that would actually hurt: the timer is
 * why the screen is opened, and the list is what gets scanned.
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
      <TimerBar projects={projects} />
      <HomeCards />
      <EntryList projects={projects} todaySeconds={timer.todaySeconds} />
    </Page>
  );
}
