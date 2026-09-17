'use client';

import { HomeCards } from './home-cards';
import { Page } from './page';

/** The panel and its regions. Today lives in the dock. */
export function Home() {
  return (
    <Page wide>
      <HomeCards />
    </Page>
  );
}
