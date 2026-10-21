'use client';

import { HomeCards } from './home-cards';
import { Page } from './page';
import { WelcomeDialog } from './welcome-dialog';

/** The panel and its regions. Today lives in the dock. */
export function Home() {
  return (
    <Page wide flush>
      <HomeCards />
      {/* A first sign-in lands here, so this is where it is welcomed. */}
      <WelcomeDialog />
    </Page>
  );
}
