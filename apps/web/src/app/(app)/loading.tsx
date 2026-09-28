import { Empty, Page } from '@/components/page';

/**
 * What a section shows the moment its tab is pressed (Constitution VI).
 * Without it the old screen stays up until the next one's server work is
 * done — Home checks the session on the server, so switching to it waited
 * a full round trip with nothing to show for the press.
 */
export default function Loading() {
  return (
    <Page>
      <Empty>Loading…</Empty>
    </Page>
  );
}
